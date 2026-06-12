package main

import (
	"context"
	"errors"
	"testing"

	"github.com/godbus/dbus/v5"
)

// fakeBusObject implements dbus.BusObject by embedding the interface (so the many
// methods we don't exercise are present but will panic if unexpectedly called) and
// overriding only CallWithContext, which is the single method stopStaleBlueZDiscovery uses.
type fakeBusObject struct {
	dbus.BusObject
	callErr    error
	calledWith string
	callCount  int
	callArgs   [][]interface{} // args of each call, in order
}

func (o *fakeBusObject) CallWithContext(ctx context.Context, method string, flags dbus.Flags, args ...interface{}) *dbus.Call {
	o.callCount++
	o.calledWith = method
	o.callArgs = append(o.callArgs, args)
	return &dbus.Call{Err: o.callErr}
}

// fakeBus implements dbusBus and records whether Close() is ever called. Close is
// the regression we are guarding against: the shared dbus.SystemBus() singleton is
// also used by the tinygo bluetooth library, so closing it breaks BLE scanning.
type fakeBus struct {
	obj    *fakeBusObject
	closed bool
}

func (b *fakeBus) Object(dest string, path dbus.ObjectPath) dbus.BusObject { return b.obj }
func (b *fakeBus) Close() error {
	b.closed = true
	return nil
}

// withFakeBus swaps systemBusProvider for one returning the given fake (or error)
// and returns a restore func for defer.
func withFakeBus(t *testing.T, bus *fakeBus, provErr error) func() {
	t.Helper()
	orig := systemBusProvider
	systemBusProvider = func() (dbusBus, error) {
		if provErr != nil {
			return nil, provErr
		}
		return bus, nil
	}
	return func() { systemBusProvider = orig }
}

// TestStopStaleBlueZDiscoveryDoesNotCloseSharedBus is the regression test for the
// bug where stopStaleBlueZDiscovery() did `defer bus.Close()` on the process-wide
// shared dbus.SystemBus() connection, which the tinygo bluetooth library depends
// on. Closing it produced "dbus: connection closed by user" on the next scan and
// wedged the scanner in an "Operation already in progress" loop forever.
func TestStopStaleBlueZDiscoveryDoesNotCloseSharedBus(t *testing.T) {
	// StopDiscovery succeeds and StopDiscovery returns an error are both exercised:
	// the original bug closed the bus via defer regardless of the call's outcome.
	cases := map[string]error{
		"StopDiscovery succeeds":      nil,
		"StopDiscovery returns error": errors.New("No discovery started"),
	}

	for name, callErr := range cases {
		t.Run(name, func(t *testing.T) {
			bus := &fakeBus{obj: &fakeBusObject{callErr: callErr}}
			defer withFakeBus(t, bus, nil)()

			stopStaleBlueZDiscovery()

			if bus.closed {
				t.Fatal("stopStaleBlueZDiscovery() closed the shared system bus; the tinygo " +
					"bluetooth library shares this connection, so closing it breaks BLE scanning")
			}
			if bus.obj.callCount != 1 {
				t.Fatalf("expected exactly one D-Bus call, got %d", bus.obj.callCount)
			}
			if want := "org.bluez.Adapter1.StopDiscovery"; bus.obj.calledWith != want {
				t.Fatalf("expected call to %q, got %q", want, bus.obj.calledWith)
			}
		})
	}
}

// TestStopStaleBlueZDiscoveryHandlesProviderError ensures a failure to obtain the
// bus is handled gracefully (logged and returned) rather than panicking.
func TestStopStaleBlueZDiscoveryHandlesProviderError(t *testing.T) {
	defer withFakeBus(t, nil, errors.New("no system bus"))()

	// Must not panic when the bus cannot be obtained.
	stopStaleBlueZDiscovery()
}

// TestEnsureAdapterPoweredSetsPoweredWithoutClosingBus verifies the power-on
// recovery sets org.bluez.Adapter1.Powered (so a powered-off adapter self-heals
// instead of looping on "adaptor is not powered") and, like all recovery code,
// never closes the shared system bus.
func TestEnsureAdapterPoweredSetsPoweredWithoutClosingBus(t *testing.T) {
	bus := &fakeBus{obj: &fakeBusObject{}}
	defer withFakeBus(t, bus, nil)()

	ensureAdapterPowered()

	if bus.closed {
		t.Fatal("ensureAdapterPowered() closed the shared system bus; it is shared with " +
			"the tinygo bluetooth library and closing it breaks BLE scanning")
	}
	if bus.obj.callCount != 1 {
		t.Fatalf("expected exactly one D-Bus call, got %d", bus.obj.callCount)
	}
	if want := "org.freedesktop.DBus.Properties.Set"; bus.obj.calledWith != want {
		t.Fatalf("expected call to %q, got %q", want, bus.obj.calledWith)
	}
}

// TestEnsureAdapterPoweredHandlesProviderError ensures a failure to obtain the bus
// is handled gracefully rather than panicking.
func TestEnsureAdapterPoweredHandlesProviderError(t *testing.T) {
	defer withFakeBus(t, nil, errors.New("no system bus"))()

	ensureAdapterPowered()
}

// TestPowerCycleAdapterSetsPoweredFalseThenTrue verifies the escalated recovery
// for a wedged bluetoothd discovery state machine (Discovering=true with no owning
// client): the adapter must be powered off and back on, in that order, and the
// shared system bus must never be closed.
func TestPowerCycleAdapterSetsPoweredFalseThenTrue(t *testing.T) {
	origDelay := powerCycleDelay
	powerCycleDelay = 0
	defer func() { powerCycleDelay = origDelay }()

	bus := &fakeBus{obj: &fakeBusObject{}}
	defer withFakeBus(t, bus, nil)()

	powerCycleAdapter()

	if bus.closed {
		t.Fatal("powerCycleAdapter() closed the shared system bus; it is shared with " +
			"the tinygo bluetooth library and closing it breaks BLE scanning")
	}
	if bus.obj.callCount != 2 {
		t.Fatalf("expected exactly two D-Bus calls (Powered=false, Powered=true), got %d", bus.obj.callCount)
	}
	for i, want := range []bool{false, true} {
		args := bus.obj.callArgs[i]
		if len(args) != 3 || args[0] != "org.bluez.Adapter1" || args[1] != "Powered" {
			t.Fatalf("call %d: expected Properties.Set on org.bluez.Adapter1 Powered, got args %v", i, args)
		}
		variant, ok := args[2].(dbus.Variant)
		if !ok || variant.Value() != want {
			t.Fatalf("call %d: expected Powered=%v, got %v", i, want, args[2])
		}
	}
}

// TestPowerCycleAdapterStopsAfterPowerOffError ensures that if powering off fails,
// the adapter is not blindly powered back on (the single Set call is the failed
// power-off) and the bus stays open.
func TestPowerCycleAdapterStopsAfterPowerOffError(t *testing.T) {
	origDelay := powerCycleDelay
	powerCycleDelay = 0
	defer func() { powerCycleDelay = origDelay }()

	bus := &fakeBus{obj: &fakeBusObject{callErr: errors.New("adapter is busy")}}
	defer withFakeBus(t, bus, nil)()

	powerCycleAdapter()

	if bus.closed {
		t.Fatal("powerCycleAdapter() closed the shared system bus")
	}
	if bus.obj.callCount != 1 {
		t.Fatalf("expected one D-Bus call (failed power-off, no power-on attempt), got %d", bus.obj.callCount)
	}
}

// TestPowerCycleAdapterHandlesProviderError ensures a failure to obtain the bus is
// handled gracefully rather than panicking.
func TestPowerCycleAdapterHandlesProviderError(t *testing.T) {
	defer withFakeBus(t, nil, errors.New("no system bus"))()

	powerCycleAdapter()
}
