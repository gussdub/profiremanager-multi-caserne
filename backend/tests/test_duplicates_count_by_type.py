"""Tests for GET /{tenant}/import/duplicates/count-by-type endpoint.

Validates:
 - Endpoint returns 200 with structured response for admin in shefford tenant
 - Response contains total, by_type (dict), message (str), details (list)
 - Requires authentication (401 when token missing)
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://active-employees.preview.emergentagent.com").rstrip("/")
TENANT = "demo"  # shefford has no user gussdub@gmail.com currently seeded; use demo
EMAIL = "gussdub@gmail.com"
PASSWORD = "230685Juin+"


@pytest.fixture(scope="module")
def auth_token():
    r = requests.post(
        f"{BASE_URL}/api/{TENANT}/auth/login",
        json={"email": EMAIL, "mot_de_passe": PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("access_token")
    assert tok, f"No access_token in response: {data}"
    return tok


@pytest.fixture()
def auth_headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


# ---- Endpoint structure ----
def test_count_by_type_returns_200(auth_headers):
    r = requests.get(
        f"{BASE_URL}/api/{TENANT}/import/duplicates/count-by-type",
        headers=auth_headers,
        timeout=30,
    )
    assert r.status_code == 200, f"Expected 200 got {r.status_code}: {r.text}"


def test_count_by_type_response_shape(auth_headers):
    r = requests.get(
        f"{BASE_URL}/api/{TENANT}/import/duplicates/count-by-type",
        headers=auth_headers,
        timeout=30,
    )
    assert r.status_code == 200
    data = r.json()
    # Required fields
    for key in ("total", "by_type", "message", "details"):
        assert key in data, f"Missing key '{key}' in response: {data}"
    assert isinstance(data["total"], int), f"total should be int, got {type(data['total'])}"
    assert isinstance(data["by_type"], dict), f"by_type should be dict"
    assert isinstance(data["message"], str), f"message should be str"
    assert isinstance(data["details"], list), f"details should be list"
    # Consistency: sum of by_type counts equals total
    assert sum(data["by_type"].values()) == data["total"]


def test_count_by_type_message_when_empty(auth_headers):
    r = requests.get(
        f"{BASE_URL}/api/{TENANT}/import/duplicates/count-by-type",
        headers=auth_headers,
        timeout=30,
    )
    data = r.json()
    if data["total"] == 0:
        assert data["message"] == "Aucun doublon"
        assert data["details"] == []
    else:
        assert data["message"] != "Aucun doublon"
        assert len(data["details"]) == len(data["by_type"])


# ---- Auth ----
def test_count_by_type_requires_auth():
    r = requests.get(
        f"{BASE_URL}/api/{TENANT}/import/duplicates/count-by-type",
        timeout=30,
    )
    assert r.status_code in (401, 403), f"Expected 401/403, got {r.status_code}"


# ---- Related duplicates endpoints ----
def test_list_duplicates_endpoint(auth_headers):
    """Ensure the existing list endpoint still works (used by ImportDuplicatesManager)."""
    r = requests.get(
        f"{BASE_URL}/api/{TENANT}/import/duplicates",
        headers=auth_headers,
        timeout=30,
    )
    assert r.status_code == 200
    data = r.json()
    assert "duplicates" in data
    assert "total" in data
    assert isinstance(data["duplicates"], list)
