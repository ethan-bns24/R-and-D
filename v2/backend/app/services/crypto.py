from __future__ import annotations

import base64
import hashlib
import hmac
import uuid


def hkdf_sha256(*, ikm: bytes, salt: bytes, info: bytes, length: int = 32) -> bytes:
    prk = hmac.new(salt, ikm, hashlib.sha256).digest()
    okm = b''
    t = b''
    counter = 1
    while len(okm) < length:
        t = hmac.new(prk, t + info + bytes([counter]), hashlib.sha256).digest()
        okm += t
        counter += 1
    return okm[:length]


def derive_secret_door(secret_base_b64: str, door_id: str) -> bytes:
    ikm = base64.b64decode(secret_base_b64)
    salt = uuid.UUID(door_id).bytes
    return hkdf_sha256(ikm=ikm, salt=salt, info=b'door-access-v1', length=32)
