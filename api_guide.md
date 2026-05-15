# API Documentation Guide (v1)

This guide documents the Central Engineering Apps Users Management API (v1). All endpoints require an `api_key` associated with a registered application.

## Base URL
`http://localhost:3001/api/v1`

## Security Overview

### **Backend Integration**
All API requests **must** be made from your application's backend server. Exposure of the `api_key` in frontend/client-side code is a major security risk.

### **Log Redaction**
To protect user privacy, the Central Auth system automatically redacts sensitive fields (e.g., `password`, `token`, `secret`) from all audit logs. While you transmit passwords in the JSON body, they are never saved in plain text within our request history database.

---

## 1. Authentication & Verification

### **Verify User (Login)**
Authenticates a user and verifies their access to a specific application.

*   **Endpoint:** `/auth/verify`
*   **Method:** `POST`
*   **Request Body:**
    ```json
    {
      "badge_number": "12345",
      "password": "user_password",
      "api_key": "your_app_api_key"
    }
    ```
*   **Success Response (200 OK):**
    ```json
    {
      "token": "JWT_TOKEN_HERE",
      "user": {
        "User_Badge": "12345",
        "User_Name": "John Doe",
        "User_Section": "Automation Engineering",
        "User_Department": "Engineering",
        "User_Level": "Admin",
        "Authority_Level": 2
      }
    }
    ```

---

## 2. User Management (Admin Required)

### **Register User**
Registers a new user in the central database. Requires Super User (Admin) credentials.

*   **Endpoint:** `/auth/register`
*   **Method:** `POST`
*   **Request Body:**
    ```json
    {
      "badge_number": "67890",
      "name": "Jane Smith",
      "department": "Production",
      "section": "Assembly Line 1",
      "password": "new_user_password",
      "api_key": "your_app_api_key",
      "admin_badge": "admin",
      "admin_password": "admin_password"
    }
    ```

### **Modify User**
Updates user details or resets password. Requires Super User credentials.

*   **Endpoint:** `/auth/modify`
*   **Method:** `POST`
*   **Request Body:**
    ```json
    {
      "target_badge": "67890",
      "api_key": "your_app_api_key",
      "admin_badge": "admin",
      "admin_password": "admin_password",
      "name": "Jane Updated",
      "department": "Quality Control",
      "section": "QA Lab",
      "reset_password": false
    }
    ```
    *Note: If `reset_password` is true, password will be reset to `user123`.*

### **Delete User**
Deletes a user from the central database. Requires Super User credentials.

*   **Endpoint:** `/auth/delete`
*   **Method:** `POST`
*   **Request Body:**
    ```json
    {
      "target_badge": "67890",
      "api_key": "your_app_api_key",
      "admin_badge": "admin",
      "admin_password": "admin_password"
    }
    ```

---

## 3. Account Settings

### **Change Password**
Allows a user to change their own password.

*   **Endpoint:** `/auth/change-password`
*   **Method:** `POST`
*   **Request Body:**
    ```json
    {
      "badge_number": "12345",
      "old_password": "current_password",
      "new_password": "new_password",
      "api_key": "your_app_api_key"
    }
    ```

---

## 4. Application Data

### **Get Authorized Users List**
Retrieves all users who have been granted access to the application associated with the API key.

*   **Endpoint:** `/users/list`
*   **Method:** `POST`
*   **Request Body:**
    ```json
    {
      "api_key": "your_app_api_key"
    }
    ```
*   **Success Response (200 OK):**
    ```json
    {
      "status": "success",
      "application": "SparepartApps",
      "users": [
        {
          "User_Badge": "12345",
          "User_Name": "John Doe",
          "User_Section": "Automation Engineering",
          "User_Department": "Engineering",
          "User_Level": "Admin",
          "Authority_Level": 2
        },
        {
          "User_Badge": "11111",
          "User_Name": "Alice Smith",
          "User_Section": "General",
          "User_Department": "General",
          "User_Level": "Technician",
          "Authority_Level": 1
        }
      ]
    }
    ```

---

## Error Handling
The API returns error messages in the following format:
```json
{
  "status": "error",
  "message": "Error description here"
}
```
*Note: Some legacy endpoints might return `{ "error": "description" }` directly.*
