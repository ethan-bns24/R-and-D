package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"
)

// DoorHandler handles door hardware → API endpoints
type DoorHandler struct {
	doorToken string
}

// NewDoorHandler creates a new DoorHandler.
// The expected bearer token is read from DOOR_API_TOKEN env var (default: "door-token-mvp").
func NewDoorHandler() *DoorHandler {
	token := os.Getenv("DOOR_API_TOKEN")
	if token == "" {
		token = "door-token-mvp"
	}
	return &DoorHandler{doorToken: token}
}

// doorLogRequest is the payload expected from the door hardware simulator.
type doorLogRequest struct {
	DoorID  string                 `json:"door_id"`
	Level   string                 `json:"level"`
	Message string                 `json:"message"`
	TS      int64                  `json:"ts"`
	Meta    map[string]interface{} `json:"meta"`
}

// SubmitLog accepts a structured log entry from a door.
// POST /v1/doors/logs
func (h *DoorHandler) SubmitLog(w http.ResponseWriter, r *http.Request) {
	// Verify door bearer token
	auth := r.Header.Get("Authorization")
	if !strings.HasPrefix(auth, "Bearer ") || strings.TrimPrefix(auth, "Bearer ") != h.doorToken {
		writeError(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req doorLogRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	log.Printf("[DoorLog] door=%s level=%s msg=%q meta=%v",
		req.DoorID, req.Level, req.Message, req.Meta)

	w.WriteHeader(http.StatusNoContent)
}
