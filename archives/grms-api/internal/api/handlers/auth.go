package handlers

import (
	"encoding/json"
	"net/http"

	"grms-backend/internal/api/middleware"
	"grms-backend/internal/service"
)

// AuthHandler handles authentication endpoints
type AuthHandler struct {
	authService *service.AuthService
}

// NewAuthHandler creates a new auth handler
func NewAuthHandler(authService *service.AuthService) *AuthHandler {
	return &AuthHandler{authService: authService}
}

// Signup handles user registration
// POST /v1/auth/signup
func (h *AuthHandler) Signup(w http.ResponseWriter, r *http.Request) {
	var req service.SignupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.Email == "" || req.Password == "" || req.Name == "" {
		writeError(w, "email, password, and name are required", http.StatusBadRequest)
		return
	}

	resp, err := h.authService.Signup(r.Context(), req)
	if err != nil {
		switch err {
		case service.ErrEmailAlreadyExists:
			writeError(w, "email already registered", http.StatusConflict)
		default:
			writeError(w, "registration failed", http.StatusInternalServerError)
		}
		return
	}

	writeJSON(w, resp, http.StatusCreated)
}

// Login handles user authentication
// POST /v1/auth/login
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req service.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.Email == "" || req.Password == "" {
		writeError(w, "email and password are required", http.StatusBadRequest)
		return
	}

	resp, err := h.authService.Login(r.Context(), req)
	if err != nil {
		switch err {
		case service.ErrInvalidCredentials:
			writeError(w, "invalid email or password", http.StatusUnauthorized)
		case service.ErrAccountInactive:
			writeError(w, "account is inactive", http.StatusForbidden)
		default:
			writeError(w, "login failed", http.StatusInternalServerError)
		}
		return
	}

	writeJSON(w, resp, http.StatusOK)
}

// Me returns the current user's info
// GET /v1/auth/me
func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.GetUserID(r.Context())
	if !ok {
		writeError(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	user, err := h.authService.GetUser(r.Context(), userID)
	if err != nil {
		writeError(w, "user not found", http.StatusNotFound)
		return
	}

	writeJSON(w, map[string]interface{}{
		"user": user.ToPublic(),
	}, http.StatusOK)
}

// StaffLogin handles staff authentication
// POST /v1/backoffice/auth/login
func (h *AuthHandler) StaffLogin(w http.ResponseWriter, r *http.Request) {
	var req service.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "invalid request body", http.StatusBadRequest)
		return
	}

	if req.Email == "" || req.Password == "" {
		writeError(w, "email and password are required", http.StatusBadRequest)
		return
	}

	resp, err := h.authService.StaffLogin(r.Context(), req)
	if err != nil {
		switch err {
		case service.ErrInvalidCredentials:
			writeError(w, "invalid email or password", http.StatusUnauthorized)
		default:
			writeError(w, "login failed", http.StatusInternalServerError)
		}
		return
	}

	writeJSON(w, resp, http.StatusOK)
}

// StaffMe returns the current staff member's info
// GET /v1/backoffice/auth/me
func (h *AuthHandler) StaffMe(w http.ResponseWriter, r *http.Request) {
	staffID, ok := middleware.GetStaffID(r.Context())
	if !ok {
		writeError(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	staff, err := h.authService.GetStaff(r.Context(), staffID)
	if err != nil {
		writeError(w, "staff not found", http.StatusNotFound)
		return
	}

	writeJSON(w, map[string]interface{}{
		"staff": staff.ToPublic(),
	}, http.StatusOK)
}
