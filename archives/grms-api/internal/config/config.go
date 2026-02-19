package config

import (
	"os"
	"time"
)

// Config holds all application configuration
type Config struct {
	Server   ServerConfig
	Database DatabaseConfig
	JWT      JWTConfig
	Crypto   CryptoConfig
}

// ServerConfig holds HTTP server settings
type ServerConfig struct {
	Port         string
	DoorLinkPort string
}

// DatabaseConfig holds database connection settings
type DatabaseConfig struct {
	URL             string
	MaxConns        int32
	MinConns        int32
	MaxConnLifetime time.Duration
}

// JWTConfig holds JWT authentication settings
type JWTConfig struct {
	Secret       string
	StaffSecret  string
	ExpiresIn    time.Duration
	StaffExpires time.Duration
}

// CryptoConfig holds cryptographic settings
type CryptoConfig struct {
	MasterKey string // Hex-encoded 32-byte key for AES-256
}

// Load reads configuration from environment variables
func Load() *Config {
	return &Config{
		Server: ServerConfig{
			Port:         getEnv("PORT", "4000"),
			DoorLinkPort: getEnv("DOORLINK_PORT", "4001"),
		},
		Database: DatabaseConfig{
			URL:             getEnv("DATABASE_URL", "postgres://grms:grms@localhost:5432/grms?sslmode=disable"),
			MaxConns:        25,
			MinConns:        5,
			MaxConnLifetime: time.Hour,
		},
		JWT: JWTConfig{
			Secret:       getEnv("JWT_SECRET", "grms-secret-key-change-in-production"),
			StaffSecret:  getEnv("JWT_STAFF_SECRET", "grms-staff-secret-change-in-production"),
			ExpiresIn:    7 * 24 * time.Hour, // 7 days for guests
			StaffExpires: 8 * time.Hour,      // 8 hours for staff
		},
		Crypto: CryptoConfig{
			MasterKey: getEnv("MASTER_KEY", "ac8ea2d005bc0684728cbc4dd90e490d87dbdd227ff1f806c94e9d3fbea9e9dd"),
		},
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
