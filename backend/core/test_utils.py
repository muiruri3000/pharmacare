"""
Shared test scaffolding. Import TenantAPITestCase from here in every
app's tests.py rather than subclassing APITestCase directly.

IMPORTANT: use `login_as(user)`, never DRF's `force_authenticate()`.
force_authenticate() sets request.user directly and skips the
authentication_classes entirely — which means
TenantScopedJWTAuthentication.authenticate() never runs, which means
set_current_tenant() never runs, which means every ORM call in the
view raises "No tenant in context". login_as() goes through the real
/api/auth/login/ endpoint and attaches a real Bearer token, so the
full authentication path (and therefore tenant scoping) is actually
exercised — which is also just a more honest integration test.
"""

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from core.context import set_current_tenant
from tenants.models import Tenant

User = get_user_model()

TEST_PASSWORD = "Testpass123!"


class TenantAPITestCase(APITestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(
            name="GreenLeaf Retail Pharmacy", slug="test-retail", tenant_type=Tenant.RETAIL
        )
        self.wholesale_tenant = Tenant.objects.create(
            name="BlueCross Wholesale", slug="test-wholesale", tenant_type=Tenant.WHOLESALE
        )
        self.other_tenant = Tenant.objects.create(
            name="Rival Pharmacy", slug="test-rival", tenant_type=Tenant.RETAIL
        )

        self.admin = User.objects.create_user(
            username="t_admin", password=TEST_PASSWORD, role=User.ADMIN, tenant=self.tenant
        )
        self.sales = User.objects.create_user(
            username="t_sales", password=TEST_PASSWORD, role=User.SALES, tenant=self.tenant
        )
        self.tech = User.objects.create_user(
            username="t_tech", password=TEST_PASSWORD, role=User.TECHNICIAN, tenant=self.tenant
        )
        self.wholesale_admin = User.objects.create_user(
            username="w_admin", password=TEST_PASSWORD, role=User.ADMIN, tenant=self.wholesale_tenant
        )
        self.other_admin = User.objects.create_user(
            username="o_admin", password=TEST_PASSWORD, role=User.ADMIN, tenant=self.other_tenant
        )

    def login_as(self, user):
        res = self.client.post(
            "/api/auth/login/",
            {"username": user.username, "password": TEST_PASSWORD},
            format="json",
        )
        assert res.status_code == 200, f"login failed for {user.username}: {res.status_code} {res.data}"
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['access']}")

    def logout(self):
        self.client.credentials()

    def tearDown(self):
        # Thread-local tenant context is plain Python state, not DB
        # state, so Django's per-test transaction rollback doesn't
        # reset it — do it explicitly so no test can leak ambient
        # tenant context into whichever test happens to run next.
        set_current_tenant(None)
        super().tearDown()

    @staticmethod
    def rows(response_data):
        """Unwrap a possibly-paginated DRF list response into a plain list."""
        return response_data["results"] if isinstance(response_data, dict) else response_data
