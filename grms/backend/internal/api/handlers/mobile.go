package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"grms-backend/internal/api/middleware"
	"grms-backend/internal/domain"
	"grms-backend/internal/repository"
	"grms-backend/internal/service"

	"github.com/google/uuid"
)

// MobileHandler handles mobile app endpoints
type MobileHandler struct {
	grantService *service.GrantService
	eventRepo    *repository.EventRepository
}

// NewMobileHandler creates a new mobile handler
func NewMobileHandler(grantService *service.GrantService, eventRepo *repository.EventRepository) *MobileHandler {
	return &MobileHandler{
		grantService: grantService,
		eventRepo:    eventRepo,
	}
}

// GetGrants returns active grants for the authenticated user
// GET /v1/mobile/grants
func (h *MobileHandler) GetGrants(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	resp, err := h.grantService.GetUserGrants(r.Context(), userID)
	if err != nil {
		writeError(w, "failed to get grants", http.StatusInternalServerError)
		return
	}

	writeJSON(w, resp, http.StatusOK)
}

// RecordAccessRequest is the request body for recording access
type RecordAccessRequest struct {
	GrantID string `json:"grant_id"`
	DoorID  string `json:"door_id"`
	Result  string `json:"result"` // "success" or "denied"
}

// RecordAccess records an access event from the mobile app
// POST /v1/mobile/access
func (h *MobileHandler) RecordAccess(w http.ResponseWriter, r *http.Request) {

	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	var req RecordAccessRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	// Parse IDs
	grantID, err := uuid.Parse(req.GrantID)
	if err != nil {
		writeError(w, "invalid grant_id", http.StatusBadRequest)
		return
	}

	doorID, err := uuid.Parse(req.DoorID)
	if err != nil {
		writeError(w, "invalid door_id", http.StatusBadRequest)
		return
	}

	// Determine result
	result := domain.EventResultSuccess
	errCode := domain.ErrCodeOK
	if req.Result == "denied" || req.Result == "fail" {
		result = domain.EventResultFail
		errCode = domain.ErrCodeUnknownKey
	}

	// Create event
	event := &domain.AccessEvent{
		EventID: uuid.New(),
		TS:      time.Now(),
		DoorID:  doorID,
		GrantID: grantID,
		UserID:  userID,
		Result:  result,
		ErrCode: errCode,
	}

	if err := h.eventRepo.Create(r.Context(), event); err != nil {
		writeError(w, "failed to record event", http.StatusInternalServerError)
		return
	}

	writeJSON(w, map[string]interface{}{
		"event_id": event.EventID,
		"recorded": true,
	}, http.StatusCreated)
}
