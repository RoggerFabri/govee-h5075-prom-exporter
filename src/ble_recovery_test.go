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
}

func (o *fakeBusObject) CallWithContext(ctx context.Context, method string, flags dbus.Flags, args ...interface{}) *dbus.Call {
	o.callCount++
	o.calledWith = method
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
