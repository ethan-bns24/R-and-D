package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"grms-backend/internal/api"
	"grms-backend/internal/api/handlers"
	"grms-backend/internal/api/middleware"
	"grms-backend/internal/config"
	"grms-backend/internal/doorlink"
	"grms-backend/internal/pkg/crypto"
	"grms-backend/internal/pkg/db"
	"grms-backend/internal/repository"
	"grms-backend/internal/service"
)

func main() {
	log.Println("Starting GRMS Backend...")

	// Load configuration
	cfg := config.Load()

	// Connect to database
	ctx := context.Background()
	pool, err := db.NewPool(ctx, db.Config{
		URL:             cfg.Database.URL,
		MaxConns:        cfg.Database.MaxConns,
		MinConns:        cfg.Database.MinConns,
		MaxConnLifetime: cfg.Database.MaxConnLifetime,
	})
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer pool.Close()
	log.Println("Connected to PostgreSQL")

	// Parse master key for encryption
	masterKey, err := crypto.ParseMasterKey(cfg.Crypto.MasterKey)
	if err != nil {
		log.Fatalf("Invalid master key: %v", err)
	}

	// Initialize repositories
	userRepo := repository.NewUserRepository(pool)
	staffRepo := repository.NewStaffRepository(pool)
	roomRepo := repository.NewRoomRepository(pool)
	doorRepo := repository.NewDoorRepository(pool)
	grantRepo := repository.NewGrantRepository(pool)
	eventRepo := repository.NewEventRepository(pool)
	auditRepo := repository.NewAuditRepository(pool)

	// Initialize DoorLink WebSocket server
	doorLinkServer := doorlink.NewServer(doorRepo, grantRepo, eventRepo, masterKey)

	// Initialize services
	authService := service.NewAuthService(
		userRepo,
		staffRepo,
		cfg.JWT.Secret,
		cfg.JWT.StaffSecret,
		cfg.JWT.ExpiresIn,
		cfg.JWT.StaffExpires,
	)

	grantService := service.NewGrantService(
		grantRepo,
		userRepo,
		doorRepo,
		roomRepo,
		auditRepo,
		doorLinkServer,
		masterKey,
	)

	doorService := service.NewDoorService(doorRepo, roomRepo, auditRepo)

	// Initialize handlers
	authHandler := handlers.NewAuthHandler(authService)
	mobileHandler := handlers.NewMobileHandler(grantService, eventRepo)
	backofficeHandler := handlers.NewBackofficeHandler(grantService, doorService, eventRepo)
	roomsHandler := handlers.NewRoomsHandler(roomRepo, doorRepo)
	legacyHandler := handlers.NewLegacyHandler(roomRepo, userRepo, eventRepo)
	doorHandler := handlers.NewDoorHandler()

	// Initialize JWT middleware
	jwtMiddleware := middleware.NewJWTMiddleware(cfg.JWT.Secret, cfg.JWT.StaffSecret)

	// Setup router
	router := api.NewRouter(
		authHandler,
		mobileHandler,
		backofficeHandler,
		roomsHandler,
		legacyHandler,
		doorHandler,
		jwtMiddleware,
	)

	// HTTP Server
	httpServer := &http.Server{
		Addr:         ":" + cfg.Server.Port,
		Handler:      router.Setup(),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// DoorLink WebSocket Server
	doorLinkHTTP := &http.Server{
		Addr:    ":" + cfg.Server.DoorLinkPort,
		Handler: doorLinkServer,
	}

	// Start servers
	go func() {
		log.Printf("GRMS REST API listening on port %s", cfg.Server.Port)
		if err := httpServer.ListenAndServe(); err != http.ErrServerClosed {
			log.Fatalf("HTTP server error: %v", err)
		}
	}()

	go func() {
		log.Printf("DoorLink WebSocket listening on port %s", cfg.Server.DoorLinkPort)
		if err := doorLinkHTTP.ListenAndServe(); err != http.ErrServerClosed {
			log.Fatalf("DoorLink server error: %v", err)
		}
	}()

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down servers...")
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := httpServer.Shutdown(ctx); err != nil {
		log.Printf("HTTP server shutdown error: %v", err)
	}
	if err := doorLinkHTTP.Shutdown(ctx); err != nil {
		log.Printf("DoorLink server shutdown error: %v", err)
	}

	log.Println("Servers stopped")
}
