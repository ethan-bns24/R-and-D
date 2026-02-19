package service

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"

	"grms-backend/internal/domain"
	"grms-backend/internal/pkg/jwt"
	"grms-backend/internal/repository"
)

var (
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrEmailAlreadyExists = errors.New("email already exists")
	ErrAccountInactive    = errors.New("account is inactive")
)

// AuthService handles authentication for users and staff
type AuthService struct {
	userRepo    *repository.UserRepository
	staffRepo   *repository.StaffRepository
	jwtSecret   string
	staffSecret string
	userExpiry  time.Duration
	staffExpiry time.Duration
}

// NewAuthService creates a new auth service
func NewAuthService(
	userRepo *repository.UserRepository,
	staffRepo *repository.StaffRepository,
	jwtSecret, staffSecret string,
	userExpiry, staffExpiry time.Duration,
) *AuthService {
	return &AuthService{
		userRepo:    userRepo,
		staffRepo:   staffRepo,
		jwtSecret:   jwtSecret,
		staffSecret: staffSecret,
		userExpiry:  userExpiry,
		staffExpiry: staffExpiry,
	}
}

// SignupRequest represents user registration data
type SignupRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Name     string `json:"name"`
}

// LoginRequest represents login data
type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// AuthResponse represents the authentication response
type AuthResponse struct {
	Token     string                 `json:"token"`
	ExpiresIn int64                  `json:"expires_in"`
	User      map[string]interface{} `json:"user"`
}

// Signup creates a new user account
func (s *AuthService) Signup(ctx context.Context, req SignupRequest) (*AuthResponse, error) {
	// Check if email exists
	exists, err := s.userRepo.EmailExists(ctx, req.Email)
	if err != nil {
		return nil, err
	}
	if exists {
		return nil, ErrEmailAlreadyExists
	}

	// Hash password
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	// Create user
	user := &domain.User{
		UserID:       uuid.New(),
		Email:        req.Email,
		PasswordHash: string(hash),
		Name:         req.Name,
		Status:       "active",
	}

	if err := s.userRepo.Create(ctx, user); err != nil {
		return nil, err
	}

	// Generate token
	token, err := jwt.GenerateUserToken(user.UserID, user.Email, user.Name, s.jwtSecret, s.userExpiry)
	if err != nil {
		return nil, err
	}

	return &AuthResponse{
		Token:     token,
		ExpiresIn: int64(s.userExpiry.Seconds()),
		User:      user.ToPublic(),
	}, nil
}

// Login authenticates a user and returns a JWT
func (s *AuthService) Login(ctx context.Context, req LoginRequest) (*AuthResponse, error) {
	user, err := s.userRepo.FindByEmail(ctx, req.Email)
	if err != nil {
		if errors.Is(err, repository.ErrUserNotFound) {
			return nil, ErrInvalidCredentials
		}
		return nil, err
	}

	// Check password
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		return nil, ErrInvalidCredentials
	}

	// Check if active
	if !user.IsActive() {
		return nil, ErrAccountInactive
	}

	// Generate token
	token, err := jwt.GenerateUserToken(user.UserID, user.Email, user.Name, s.jwtSecret, s.userExpiry)
	if err != nil {
		return nil, err
	}

	return &AuthResponse{
		Token:     token,
		ExpiresIn: int64(s.userExpiry.Seconds()),
		User:      user.ToPublic(),
	}, nil
}

// StaffLoginResponse includes role information
type StaffLoginResponse struct {
	Token     string                 `json:"token"`
	ExpiresIn int64                  `json:"expires_in"`
	Staff     map[string]interface{} `json:"staff"`
}

// StaffLogin authenticates a staff member
func (s *AuthService) StaffLogin(ctx context.Context, req LoginRequest) (*StaffLoginResponse, error) {
	staff, err := s.staffRepo.FindByEmail(ctx, req.Email)
	if err != nil {
		if errors.Is(err, repository.ErrStaffNotFound) {
			return nil, ErrInvalidCredentials
		}
		return nil, err
	}

	// Check password
	if err := bcrypt.CompareHashAndPassword([]byte(staff.PasswordHash), []byte(req.Password)); err != nil {
		return nil, ErrInvalidCredentials
	}

	// Generate token
	token, err := jwt.GenerateStaffToken(staff.StaffID, staff.Email, staff.Name, string(staff.Role), s.staffSecret, s.staffExpiry)
	if err != nil {
		return nil, err
	}

	return &StaffLoginResponse{
		Token:     token,
		ExpiresIn: int64(s.staffExpiry.Seconds()),
		Staff:     staff.ToPublic(),
	}, nil
}

// GetUser retrieves user info by ID
func (s *AuthService) GetUser(ctx context.Context, userID uuid.UUID) (*domain.User, error) {
	return s.userRepo.FindByID(ctx, userID)
}

// GetStaff retrieves staff info by ID
func (s *AuthService) GetStaff(ctx context.Context, staffID uuid.UUID) (*domain.Staff, error) {
	return s.staffRepo.FindByID(ctx, staffID)
}
