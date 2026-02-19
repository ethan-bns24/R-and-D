package handlers

import (
	"net/http"

	"grms-backend/internal/repository"
)

// RoomsHandler handles room-related endpoints
type RoomsHandler struct {
	roomRepo *repository.RoomRepository
	doorRepo *repository.DoorRepository
}

// NewRoomsHandler creates a new rooms handler
func NewRoomsHandler(roomRepo *repository.RoomRepository, doorRepo *repository.DoorRepository) *RoomsHandler {
	return &RoomsHandler{
		roomRepo: roomRepo,
		doorRepo: doorRepo,
	}
}

// List returns all rooms
// GET /v1/rooms
func (h *RoomsHandler) List(w http.ResponseWriter, r *http.Request) {
	rooms, err := h.roomRepo.FindAll(r.Context())
	if err != nil {
		writeError(w, "failed to list rooms", http.StatusInternalServerError)
		return
	}

	writeJSON(w, rooms, http.StatusOK)
}

// ListAvailable returns available rooms
// GET /v1/rooms/available
func (h *RoomsHandler) ListAvailable(w http.ResponseWriter, r *http.Request) {
	rooms, err := h.roomRepo.FindAvailable(r.Context())
	if err != nil {
		writeError(w, "failed to list rooms", http.StatusInternalServerError)
		return
	}

	writeJSON(w, rooms, http.StatusOK)
}
