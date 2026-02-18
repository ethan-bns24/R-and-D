package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"grms-backend/internal/api/handlers"
	"grms-backend/internal/api/middleware"
)

// Router holds all HTTP handlers and middleware
type Router struct {
	authHandler       *handlers.AuthHandler
	mobileHandler     *handlers.MobileHandler
	backofficeHandler *handlers.BackofficeHandler
	roomsHandler      *handlers.RoomsHandler
	legacyHandler     *handlers.LegacyHandler
	doorHandler       *handlers.DoorHandler
	jwtMiddleware     *middleware.JWTMiddleware
}

// NewRouter creates a new router with all handlers
func NewRouter(
	auth *handlers.AuthHandler,
	mobile *handlers.MobileHandler,
	backoffice *handlers.BackofficeHandler,
	rooms *handlers.RoomsHandler,
	legacy *handlers.LegacyHandler,
	door *handlers.DoorHandler,
	jwtMw *middleware.JWTMiddleware,
) *Router {
	return &Router{
		authHandler:       auth,
		mobileHandler:     mobile,
		backofficeHandler: backoffice,
		roomsHandler:      rooms,
		legacyHandler:     legacy,
		doorHandler:       door,
		jwtMiddleware:     jwtMw,
	}
}

// Setup configures and returns the HTTP handler
func (rt *Router) Setup() http.Handler {
	r := chi.NewRouter()

	// Global middlewares
	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)
	r.Use(middleware.Logger)
	r.Use(chimw.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Health check
	r.Get("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"message": "GRMS API running", "version": "2.0.0"}`))
	})

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status": "ok"}`))
	})

	// ============================================
	// API v1
	// ============================================
	r.Route("/v1", func(r chi.Router) {
		// Auth (public)
		r.Route("/auth", func(r chi.Router) {
			r.Post("/signup", rt.authHandler.Signup)
			r.Post("/login", rt.authHandler.Login)

			// Protected
			r.Group(func(r chi.Router) {
				r.Use(rt.jwtMiddleware.VerifyUser)
				r.Get("/me", rt.authHandler.Me)
			})
		})

		// Mobile (user auth required)
		r.Route("/mobile", func(r chi.Router) {
			r.Use(rt.jwtMiddleware.VerifyUser)
			r.Get("/grants", rt.mobileHandler.GetGrants)
			r.Post("/access", rt.mobileHandler.RecordAccess)
		})

		// Rooms (public for listing)
		r.Route("/rooms", func(r chi.Router) {
			r.Get("/", rt.roomsHandler.List)
			r.Get("/available", rt.roomsHandler.ListAvailable)
		})

		// Doors (hardware → API)
		r.Route("/doors", func(r chi.Router) {
			r.Post("/logs", rt.doorHandler.SubmitLog)
		})

		// Backoffice (staff auth required)
		r.Route("/backoffice", func(r chi.Router) {
			// Staff auth
			r.Post("/auth/login", rt.authHandler.StaffLogin)

			// Protected routes
			r.Group(func(r chi.Router) {
				r.Use(rt.jwtMiddleware.VerifyStaff)
				r.Get("/auth/me", rt.authHandler.StaffMe)
				r.Post("/assign", rt.backofficeHandler.Assign)
				r.Post("/revoke", rt.backofficeHandler.Revoke)
				r.Get("/events", rt.backofficeHandler.Events)
				r.Get("/doors", rt.backofficeHandler.Doors)
				r.Get("/doors/{door_id}/grants", rt.backofficeHandler.GetDoorGrants)
				r.Post("/doors/unlock", rt.backofficeHandler.UnlockDoor)
			})
		})
	})

	// ============================================
	// Legacy endpoints (compatibility with index.js)
	// ============================================
	r.Route("/auth", func(r chi.Router) {
		r.Post("/login", rt.authHandler.Login)
		r.Group(func(r chi.Router) {
			r.Use(rt.jwtMiddleware.VerifyUser)
			r.Get("/me", rt.authHandler.Me)
			r.Get("/my-token", rt.mobileHandler.GetGrants) // Redirects to grants
		})
	})

	r.Get("/rooms", rt.legacyHandler.ListRooms)
	r.Get("/clients", rt.legacyHandler.ListClients)
	r.Get("/logs", rt.legacyHandler.ListLogs)

	return r
}
