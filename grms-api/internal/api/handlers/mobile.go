package handlers

import (
	"net/http"

	"grms-backend/internal/api/middleware"
	"grms-backend/internal/service"
)

// MobileHandler handles mobile app endpoints
type MobileHandler struct {
	grantService *service.GrantService
}

// NewMobileHandler creates a new mobile handler
func NewMobileHandler(grantService *service.GrantService) *MobileHandler {
	return &MobileHandler{grantService: grantService}
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
