package main

import (
	"os"
	"testing"
)

func TestLoadKnownGovees(t *testing.T) {
	// Create a temporary test file
	content := `A4:C1:38:12:34:56 Living_Room 1.5 -2.0
B4:C1:38:12:34:57 Bedroom -0.5 1.0
Invalid Line
C4:C1:38:12:34:58 Kitchen invalid offset
`
	tmpfile, err := os.CreateTemp("", "known_govees")
	if err != nil {
		t.Fatal(err)
	}
	defer os.Remove(tmpfile.Name())

	if _, err := tmpfile.Write([]byte(content)); err != nil {
		t.Fatal(err)
	}
	if err := tmpfile.Close(); err != nil {
		t.Fatal(err)
	}

	// Temporarily replace the filename constant
	os.Rename(".known_govees", ".known_govees.bak")
	defer os.Rename(".known_govees.bak", ".known_govees")

	if err := os.Symlink(tmpfile.Name(), ".known_govees"); err != nil {
		t.Fatal(err)
	}

	// Test loading the file
	loadKnownGovees()

	// Verify the contents
	expected := map[string]KnownGovee{
		"A4:C1:38:12:34:56": {Name: "Living_Room", TempOffset: 1.5, HumidityOffset: -2.0},
		"B4:C1:38:12:34:57": {Name: "Bedroom", TempOffset: -0.5, HumidityOffset: 1.0},
	}

	mutex.Lock()
	defer mutex.Unlock()

	if len(knownGovees) != len(expected) {
		t.Errorf("got %d devices, want %d", len(knownGovees), len(expected))
	}

	for mac, want := range expected {
		got, exists := knownGovees[mac]
		if !exists {
			t.Errorf("device %s not found", mac)
			continue
		}
		if got.Name != want.Name || got.TempOffset != want.TempOffset || got.HumidityOffset != want.HumidityOffset {
			t.Errorf("device %s: got %+v, want %+v", mac, got, want)
		}
	}
}
