package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/google/uuid"

	"grms-backend/internal/pkg/jwt"
)

type contextKey string

const (
	UserIDKey  contextKey = "user_id"
	StaffIDKey contextKey = "staff_id"
	StaffRole  contextKey = "staff_role"
)

// JWTMiddleware handles JWT authentication
type JWTMiddleware struct {
	userSecret  string
	staffSecret string
}

// NewJWTMiddleware creates a new JWT middleware
func NewJWTMiddleware(userSecret, staffSecret string) *JWTMiddleware {
	return &JWTMiddleware{
		userSecret:  userSecret,
		staffSecret: staffSecret,
	}
}

// VerifyUser middleware for guest user authentication
func (m *JWTMiddleware) VerifyUser(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := extractToken(r)
		if token == "" {
			http.Error(w, `{"error": "missing authorization header"}`, http.StatusUnauthorized)
			return
		}

		claims, err := jwt.ValidateUserToken(token, m.userSecret)
		if err != nil {
			http.Error(w, `{"error": "invalid or expired token"}`, http.StatusUnauthorized)
			return
		}

		// Add user info to context
		ctx := context.WithValue(r.Context(), UserIDKey, claims.UserID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// VerifyStaff middleware for staff authentication
func (m *JWTMiddleware) VerifyStaff(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := extractToken(r)
		if token == "" {
			http.Error(w, `{"error": "missing authorization header"}`, http.StatusUnauthorized)
			return
		}

		claims, err := jwt.ValidateStaffToken(token, m.staffSecret)
		if err != nil {
			http.Error(w, `{"error": "invalid or expired token"}`, http.StatusUnauthorized)
			return
		}

		// Add staff info to context
		ctx := context.WithValue(r.Context(), StaffIDKey, claims.StaffID)
		ctx = context.WithValue(ctx, StaffRole, claims.Role)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// VerifyAdmin middleware for admin-only routes
func (m *JWTMiddleware) VerifyAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := extractToken(r)
		if token == "" {
			http.Error(w, `{"error": "missing authorization header"}`, http.StatusUnauthorized)
			return
		}

		claims, err := jwt.ValidateStaffToken(token, m.staffSecret)
		if err != nil {
			http.Error(w, `{"error": "invalid or expired token"}`, http.StatusUnauthorized)
			return
		}

		if claims.Role != "admin" {
			http.Error(w, `{"error": "admin access required"}`, http.StatusForbidden)
			return
		}

		ctx := context.WithValue(r.Context(), StaffIDKey, claims.StaffID)
		ctx = context.WithValue(ctx, StaffRole, claims.Role)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// GetUserID extracts user ID from context
func GetUserID(ctx context.Context) (uuid.UUID, bool) {
	id, ok := ctx.Value(UserIDKey).(uuid.UUID)
	return id, ok
}

// GetStaffID extracts staff ID from context
func GetStaffID(ctx context.Context) (uuid.UUID, bool) {
	id, ok := ctx.Value(StaffIDKey).(uuid.UUID)
	return id, ok
}

// GetStaffRole extracts staff role from context
func GetStaffRole(ctx context.Context) (string, bool) {
	role, ok := ctx.Value(StaffRole).(string)
	return role, ok
}

func extractToken(r *http.Request) string {
	auth := r.Header.Get("Authorization")
	if auth == "" {
		return ""
	}

	// Support both "Bearer token" and just "token"
	if strings.HasPrefix(auth, "Bearer ") {
		return strings.TrimPrefix(auth, "Bearer ")
	}
	return auth
}
