package handlers

import (
	"net/http"

	"grms-backend/internal/repository"
)

// LegacyHandler maintains compatibility with the original index.js API
type LegacyHandler struct {
	roomRepo  *repository.RoomRepository
	userRepo  *repository.UserRepository
	eventRepo *repository.EventRepository
}

// NewLegacyHandler creates a new legacy handler
func NewLegacyHandler(
	roomRepo *repository.RoomRepository,
	userRepo *repository.UserRepository,
	eventRepo *repository.EventRepository,
) *LegacyHandler {
	return &LegacyHandler{
		roomRepo:  roomRepo,
		userRepo:  userRepo,
		eventRepo: eventRepo,
	}
}

// ListRooms returns rooms in legacy format
// GET /rooms
func (h *LegacyHandler) ListRooms(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	rooms, err := h.roomRepo.FindAll(ctx)
	if err != nil {
		writeError(w, "failed to list rooms", http.StatusInternalServerError)
		return
	}

	// Convert to legacy format (numeric IDs)
	type legacyRoom struct {
		ID          int    `json:"id"`
		Status      string `json:"status"`
		LockedUntil *int64 `json:"lockedUntil"`
		ClientID    *int   `json:"clientId"`
	}

	var result []legacyRoom
	for _, room := range rooms {
		// Extract numeric part from room number (e.g., "101" -> 101)
		id := 0
		for _, c := range room.RoomNumber {
			if c >= '0' && c <= '9' {
				id = id*10 + int(c-'0')
			}
		}
		if id == 0 {
			id = len(result) + 101
		}

		result = append(result, legacyRoom{
			ID:     id,
			Status: mapStatus(room.Status),
		})
	}

	writeJSON(w, result, http.StatusOK)
}

// ListClients returns users in legacy format
// GET /clients
func (h *LegacyHandler) ListClients(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	users, err := h.userRepo.FindAll(ctx)
	if err != nil {
		writeError(w, "failed to list clients", http.StatusInternalServerError)
		return
	}

	// Convert to legacy format
	type legacyClient struct {
		ID     int     `json:"id"`
		Name   string  `json:"name"`
		Email  string  `json:"email"`
		Phone  *string `json:"phone"`
		Status string  `json:"status"`
	}

	var result []legacyClient
	for i, user := range users {
		result = append(result, legacyClient{
			ID:     i + 1,
			Name:   user.Name,
			Email:  user.Email,
			Phone:  user.Phone,
			Status: user.Status,
		})
	}

	writeJSON(w, result, http.StatusOK)
}

// ListLogs returns events in legacy format
// GET /logs
func (h *LegacyHandler) ListLogs(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	events, err := h.eventRepo.FindRecent(ctx, 100)
	if err != nil {
		writeError(w, "failed to list logs", http.StatusInternalServerError)
		return
	}

	// Convert to legacy format
	type legacyLog struct {
		Type     string `json:"type"`
		RoomID   string `json:"roomId"`
		ClientID string `json:"clientId,omitempty"`
		Time     string `json:"time"`
		Result   string `json:"result,omitempty"`
	}

	var result []legacyLog
	for _, event := range events {
		logType := "ACCESS_ATTEMPT"
		if event.Result == "success" {
			logType = "DOOR_OPENED"
		}

		result = append(result, legacyLog{
			Type:     logType,
			RoomID:   event.DoorID.String(),
			ClientID: event.UserID.String(),
			Time:     event.TS.Format("2006-01-02T15:04:05Z07:00"),
			Result:   event.Result,
		})
	}

	writeJSON(w, result, http.StatusOK)
}

func mapStatus(status string) string {
	switch status {
	case "available":
		return "free"
	case "occupied":
		return "occupied"
	case "locked":
		return "locked"
	default:
		return "free"
	}
}
