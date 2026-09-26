package main

import (
	"io"
	"net/http/httptest"
	"testing"
)

func TestPing(t *testing.T) {
	response, err := newApp().Test(httptest.NewRequest("GET", "/marpos/api/ping", nil))
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != 200 || string(body) != `{"data":{"ping":"pong"},"success":true,"error":{}}` {
		t.Fatalf("status=%d body=%s", response.StatusCode, body)
	}
}
