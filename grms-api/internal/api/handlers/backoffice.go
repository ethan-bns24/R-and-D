package handlers

import (
	"encoding/json"
	"net/http"

	"grms-backend/internal/api/middleware"
	"grms-backend/internal/repository"
	"grms-backend/internal/service"

	chi "github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// BackofficeHandler handles backoffice endpoints
type BackofficeHandler struct {
	grantService *service.GrantService
	doorService  *service.DoorService
	eventRepo    *repository.EventRepository
}

// NewBackofficeHandler creates a new backoffice handler
func NewBackofficeHandler(
	grantService *service.GrantService,
	doorService *service.DoorService,
	eventRepo *repository.EventRepository,
) *BackofficeHandler {
	return &BackofficeHandler{
		grantService: grantService,
		doorService:  doorService,
		eventRepo:    eventRepo,
	}
}

// Assign creates an access grant for a user
// POST /v1/backoffice/assign
func (h *BackofficeHandler) Assign(w http.ResponseWriter, r *http.Request) {
	staffID, ok := middleware.GetStaffID(r.Context())
	if !ok {
		writeError(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req service.AssignRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.UserEmail == "" {
		writeError(w, "user_email is required", http.StatusBadRequest)
		return
	}

	if req.RoomID == uuid.Nil && req.RoomNumber == "" {
		writeError(w, "room_id or room_number is required", http.StatusBadRequest)
		return
	}

	if req.FromTS == 0 || req.ToTS == 0 {
		writeError(w, "from_ts and to_ts are required", http.StatusBadRequest)
		return
	}

	resp, err := h.grantService.Assign(r.Context(), req, staffID)
	if err != nil {
		switch err {
		case service.ErrUserNotFound:
			writeError(w, "user not found", http.StatusNotFound)
		case service.ErrRoomNotFound:
			writeError(w, "room not found", http.StatusNotFound)
		default:
			writeError(w, "assignment failed: "+err.Error(), http.StatusInternalServerError)
		}
		return
	}

	writeJSON(w, resp, http.StatusCreated)
}

// Revoke invalidates an access grant
// POST /v1/backoffice/revoke
func (h *BackofficeHandler) Revoke(w http.ResponseWriter, r *http.Request) {
	staffID, ok := middleware.GetStaffID(r.Context())
	if !ok {
		writeError(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		GrantID string `json:"grant_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	grantID, err := uuid.Parse(req.GrantID)
	if err != nil {
		writeError(w, "invalid grant_id", http.StatusBadRequest)
		return
	}

	if err := h.grantService.Revoke(r.Context(), grantID, staffID); err != nil {
		if err == service.ErrGrantNotFound {
			writeError(w, "grant not found", http.StatusNotFound)
			return
		}
		writeError(w, "revocation failed", http.StatusInternalServerError)
		return
	}

	writeJSON(w, map[string]bool{"ok": true}, http.StatusOK)
}

// Events returns access events
// GET /v1/backoffice/events
func (h *BackofficeHandler) Events(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	var doorID *uuid.UUID
	if d := q.Get("door_id"); d != "" {
		id, err := uuid.Parse(d)
		if err == nil {
			doorID = &id
		}
	}

	limit := 100
	events, err := h.eventRepo.Query(r.Context(), doorID, nil, nil, limit)
	if err != nil {
		writeError(w, "query failed", http.StatusInternalServerError)
		return
	}

	writeJSON(w, events, http.StatusOK)
}

// Doors returns door statuses
// GET /v1/backoffice/doors
func (h *BackofficeHandler) Doors(w http.ResponseWriter, r *http.Request) {
	doors, err := h.doorService.GetAllDoors(r.Context())
	if err != nil {
		writeError(w, "failed to get doors", http.StatusInternalServerError)
		return
	}

	writeJSON(w, doors, http.StatusOK)
}

// UnlockDoor removes lock from a door
// POST /v1/backoffice/doors/:id/unlock
func (h *BackofficeHandler) UnlockDoor(w http.ResponseWriter, r *http.Request) {
	staffID, ok := middleware.GetStaffID(r.Context())
	if !ok {
		writeError(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		DoorID string `json:"door_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	doorID, err := uuid.Parse(req.DoorID)
	if err != nil {
		writeError(w, "invalid door_id", http.StatusBadRequest)
		return
	}

	if err := h.doorService.UnlockDoor(r.Context(), doorID, staffID); err != nil {
		writeError(w, "unlock failed", http.StatusInternalServerError)
		return
	}

	writeJSON(w, map[string]bool{"ok": true}, http.StatusOK)
}

func (h *BackofficeHandler) GetDoorGrants(w http.ResponseWriter, r *http.Request) {
	doorIDStr := chi.URLParam(r, "door_id")
	doorID, err := uuid.Parse(doorIDStr)
	if err != nil {
		writeError(w, "invalid door_id", http.StatusBadRequest)
		return
	}

	// Get grants for this door from grantService
	grants, err := h.grantService.GetGrantByID(r.Context(), doorID)
	if err != nil {
		writeError(w, "failed to fetch grants", http.StatusInternalServerError)
		return
	}

	writeJSON(w, map[string]interface{}{
		"door_id": doorID,
		"grants":  grants,
	}, http.StatusOK)
}
