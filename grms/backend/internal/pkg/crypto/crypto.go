package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"

	"github.com/google/uuid"
	"golang.org/x/crypto/hkdf"
)

const (
	// SecretLength is the size of secrets in bytes (256 bits)
	SecretLength = 32
	// NonceLength is the size of BLE nonces in bytes
	NonceLength = 32
	// HKDFInfo is the context string for key derivation
	HKDFInfo = "door-access-v1"
	// ProtoVersion is the current protocol version
	ProtoVersion byte = 0x01
)

var (
	ErrCiphertextTooShort = errors.New("ciphertext too short")
	ErrInvalidKeyLength   = errors.New("invalid key length")
)

// GenerateSecretBase generates a cryptographically secure 256-bit secret
func GenerateSecretBase() ([]byte, error) {
	secret := make([]byte, SecretLength)
	if _, err := rand.Read(secret); err != nil {
		return nil, err
	}
	return secret, nil
}

// DeriveSecretDoor derives a door-specific secret using HKDF-SHA256
// secret_door = HKDF-SHA256(secret_base, salt=door_id, info="door-access-v1")
func DeriveSecretDoor(secretBase []byte, doorID uuid.UUID) ([]byte, error) {
	salt := doorID[:]
	reader := hkdf.New(sha256.New, secretBase, salt, []byte(HKDFInfo))

	secretDoor := make([]byte, SecretLength)
	if _, err := io.ReadFull(reader, secretDoor); err != nil {
		return nil, err
	}
	return secretDoor, nil
}

// ComputeHMAC calculates the MAC for BLE authentication
// mac = HMAC-SHA256(secret_door, nonce || door_id || key_id || version)
func ComputeHMAC(secretDoor, nonce []byte, doorID, keyID uuid.UUID, version byte) []byte {
	h := hmac.New(sha256.New, secretDoor)
	h.Write(nonce)
	h.Write(doorID[:])
	h.Write(keyID[:])
	h.Write([]byte{version})
	return h.Sum(nil)
}

// VerifyHMAC verifies a MAC using constant-time comparison
func VerifyHMAC(secretDoor, nonce []byte, doorID, keyID uuid.UUID, version byte, mac []byte) bool {
	expected := ComputeHMAC(secretDoor, nonce, doorID, keyID, version)
	return hmac.Equal(expected, mac)
}

// EncryptSecret encrypts a secret using AES-256-GCM
// Returns: nonce (12 bytes) || ciphertext || tag (16 bytes)
func EncryptSecret(masterKey, plaintext []byte) ([]byte, error) {
	if len(masterKey) != 32 {
		return nil, ErrInvalidKeyLength
	}

	block, err := aes.NewCipher(masterKey)
	if err != nil {
		return nil, err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}

	// Seal appends the ciphertext to nonce
	ciphertext := gcm.Seal(nonce, nonce, plaintext, nil)
	return ciphertext, nil
}

// DecryptSecret decrypts a secret encrypted with EncryptSecret
func DecryptSecret(masterKey, ciphertext []byte) ([]byte, error) {
	if len(masterKey) != 32 {
		return nil, ErrInvalidKeyLength
	}

	block, err := aes.NewCipher(masterKey)
	if err != nil {
		return nil, err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	if len(ciphertext) < gcm.NonceSize() {
		return nil, ErrCiphertextTooShort
	}

	nonce := ciphertext[:gcm.NonceSize()]
	ciphertext = ciphertext[gcm.NonceSize():]

	return gcm.Open(nil, nonce, ciphertext, nil)
}

// GenerateNonce generates a random nonce for BLE challenge-response
func GenerateNonce() ([]byte, error) {
	nonce := make([]byte, NonceLength)
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}
	return nonce, nil
}

// ParseMasterKey parses a hex-encoded master key
func ParseMasterKey(hexKey string) ([]byte, error) {
	key, err := hex.DecodeString(hexKey)
	if err != nil {
		return nil, err
	}
	if len(key) != 32 {
		return nil, ErrInvalidKeyLength
	}
	return key, nil
}

// HashPassword hashes a password using SHA256 (use bcrypt in production)
// This is a simplified version - production should use bcrypt
func HashPassword(password string) string {
	h := sha256.Sum256([]byte(password))
	return hex.EncodeToString(h[:])
}

// VerifyPassword checks if a password matches the hash
func VerifyPassword(password, hash string) bool {
	return HashPassword(password) == hash
}
