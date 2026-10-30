from django.contrib.auth import get_user_model

from core.test_utils import TenantAPITestCase, TEST_PASSWORD

User = get_user_model()


class AuthTests(TenantAPITestCase):
    def test_login_returns_tokens(self):
        res = self.client.post(
            "/api/auth/login/", {"username": self.admin.username, "password": TEST_PASSWORD}, format="json"
        )
        self.assertEqual(res.status_code, 200)
        self.assertIn("access", res.data)
        self.assertIn("refresh", res.data)

    def test_login_wrong_password_rejected(self):
        res = self.client.post(
            "/api/auth/login/", {"username": self.admin.username, "password": "wrong"}, format="json"
        )
        self.assertEqual(res.status_code, 401)

    def test_me_reflects_role_and_tenant(self):
        self.login_as(self.sales)
        res = self.client.get("/api/auth/me/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["role"], "sales")
        self.assertEqual(res.data["tenant_id"], self.tenant.id)
        self.assertEqual(res.data["tenant_type"], "retail")

    def test_me_requires_auth(self):
        res = self.client.get("/api/auth/me/")
        self.assertEqual(res.status_code, 401)

    def test_change_password_then_login_with_new_password(self):
        self.login_as(self.admin)
        res = self.client.post("/api/auth/change-password/", {
            "old_password": TEST_PASSWORD, "new_password": "NewPassw0rd!23",
        }, format="json")
        self.assertEqual(res.status_code, 200)

        self.logout()
        res = self.client.post(
            "/api/auth/login/", {"username": self.admin.username, "password": "NewPassw0rd!23"}, format="json"
        )
        self.assertEqual(res.status_code, 200)

    def test_change_password_wrong_old_password_rejected(self):
        self.login_as(self.admin)
        res = self.client.post("/api/auth/change-password/", {
            "old_password": "wrong", "new_password": "NewPassw0rd!23",
        }, format="json")
        self.assertEqual(res.status_code, 400)


class UserManagementTests(TenantAPITestCase):
    def test_admin_can_create_user(self):
        self.login_as(self.admin)
        res = self.client.post("/api/users/", {
            "username": "new_tech", "role": "technician", "password": "Techpass123!",
        }, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(User.objects.get(username="new_tech").tenant_id, self.tenant.id)

    def test_sales_cannot_manage_users(self):
        self.login_as(self.sales)
        self.assertEqual(self.client.get("/api/users/").status_code, 403)
        res = self.client.post("/api/users/", {
            "username": "sneaky", "role": "admin", "password": "Sneaky123!",
        }, format="json")
        self.assertEqual(res.status_code, 403)

    def test_technician_cannot_manage_users(self):
        self.login_as(self.tech)
        self.assertEqual(self.client.get("/api/users/").status_code, 403)

    def test_admin_deactivate_is_soft_delete(self):
        self.login_as(self.admin)
        res = self.client.delete(f"/api/users/{self.sales.id}/")
        self.assertEqual(res.status_code, 204)
        self.sales.refresh_from_db()
        self.assertFalse(self.sales.is_active_employee)
        self.assertFalse(self.sales.is_active)
        # user record itself still exists (history-preserving, not a hard delete)
        self.assertTrue(User.objects.filter(id=self.sales.id).exists())

    def test_deactivated_user_cannot_login(self):
        self.login_as(self.admin)
        self.client.delete(f"/api/users/{self.sales.id}/")
        self.logout()
        res = self.client.post(
            "/api/auth/login/", {"username": self.sales.username, "password": TEST_PASSWORD}, format="json"
        )
        self.assertEqual(res.status_code, 401)

    def test_new_user_created_via_api_is_assigned_callers_tenant_not_client_supplied(self):
        self.login_as(self.wholesale_admin)
        res = self.client.post("/api/users/", {
            "username": "w_new_sales", "role": "sales", "password": "Wholesale123!",
            # deliberately NOT sending a tenant field — it must come from the caller
        }, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(User.objects.get(username="w_new_sales").tenant_id, self.wholesale_tenant.id)

    def test_admin_cannot_see_other_tenants_users(self):
        self.login_as(self.admin)
        res = self.client.get("/api/users/")
        usernames = [u["username"] for u in self.rows(res.data)]
        self.assertIn(self.sales.username, usernames)
        self.assertNotIn(self.wholesale_admin.username, usernames)
        self.assertNotIn(self.other_admin.username, usernames)

    def test_admin_cannot_edit_another_tenants_user(self):
        self.login_as(self.admin)
        res = self.client.patch(f"/api/users/{self.wholesale_admin.id}/", {"role": "sales"}, format="json")
        self.assertEqual(res.status_code, 404)  # scoped out of the queryset entirely, not a 403
