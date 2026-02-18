package jwt

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

var (
	ErrInvalidToken = errors.New("invalid token")
	ErrExpiredToken = errors.New("token expired")
)

// Claims represents the JWT payload for users
type Claims struct {
	UserID uuid.UUID `json:"user_id"`
	Email  string    `json:"email"`
	Name   string    `json:"name"`
	jwt.RegisteredClaims
}

// StaffClaims represents the JWT payload for staff members
type StaffClaims struct {
	StaffID uuid.UUID `json:"staff_id"`
	Email   string    `json:"email"`
	Name    string    `json:"name"`
	Role    string    `json:"role"`
	jwt.RegisteredClaims
}

// GenerateUserToken creates a JWT for a guest user
func GenerateUserToken(userID uuid.UUID, email, name, secret string, expiry time.Duration) (string, error) {
	claims := Claims{
		UserID: userID,
		Email:  email,
		Name:   name,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(expiry)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "grms",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

// GenerateStaffToken creates a JWT for a staff member
func GenerateStaffToken(staffID uuid.UUID, email, name, role, secret string, expiry time.Duration) (string, error) {
	claims := StaffClaims{
		StaffID: staffID,
		Email:   email,
		Name:    name,
		Role:    role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(expiry)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "grms-staff",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

// ValidateUserToken verifies and parses a user JWT
func ValidateUserToken(tokenString, secret string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, ErrInvalidToken
		}
		return []byte(secret), nil
	})

	if err != nil {
		if errors.Is(err, jwt.ErrTokenExpired) {
			return nil, ErrExpiredToken
		}
		return nil, err
	}

	if claims, ok := token.Claims.(*Claims); ok && token.Valid {
		return claims, nil
	}

	return nil, ErrInvalidToken
}

// ValidateStaffToken verifies and parses a staff JWT
func ValidateStaffToken(tokenString, secret string) (*StaffClaims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &StaffClaims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, ErrInvalidToken
		}
		return []byte(secret), nil
	})

	if err != nil {
		if errors.Is(err, jwt.ErrTokenExpired) {
			return nil, ErrExpiredToken
		}
		return nil, ErrInvalidToken
	}

	if claims, ok := token.Claims.(*StaffClaims); ok && token.Valid {
		return claims, nil
	}

	return nil, ErrInvalidToken
}
