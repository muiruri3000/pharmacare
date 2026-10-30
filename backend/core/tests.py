from django.test import TestCase

from core.context import get_current_tenant, set_current_tenant, tenant_context
from inventory.models import Category
from tenants.models import Tenant


class TenantScopingTests(TestCase):
    """
    Direct tests of the tenant-isolation mechanism itself (core/managers.py,
    core/context.py, core/abstract_models.py) — the two real bugs found
    while building this app (get_or_create silently skipping tenant
    injection, and refresh_from_db raising because _base_manager was
    scoped) both lived here. Catch regressions here, not three layers
    away in a view test.
    """

    def setUp(self):
        self.tenant = Tenant.objects.create(name="Tenant A", slug="core-test-a", tenant_type=Tenant.RETAIL)
        self.other_tenant = Tenant.objects.create(name="Tenant B", slug="core-test-b", tenant_type=Tenant.RETAIL)

    def tearDown(self):
        set_current_tenant(None)

    def test_unscoped_query_without_context_raises(self):
        set_current_tenant(None)
        with self.assertRaises(RuntimeError):
            list(Category.objects.all())

    def test_query_is_scoped_to_current_tenant(self):
        with tenant_context(self.tenant):
            Category.objects.create(name="Analgesics")
        with tenant_context(self.other_tenant):
            Category.objects.create(name="Antibiotics")

        with tenant_context(self.tenant):
            names = list(Category.objects.values_list("name", flat=True))
        self.assertEqual(names, ["Analgesics"])

    def test_create_auto_assigns_current_tenant(self):
        with tenant_context(self.tenant):
            cat = Category.objects.create(name="Vitamins")
        self.assertEqual(cat.tenant_id, self.tenant.id)

    def test_get_or_create_assigns_tenant_on_the_create_path(self):
        # Regression test: get_or_create() calls QuerySet.create()
        # internally (not Manager.create()), so tenant injection has to
        # live on the queryset, not just the manager, or this silently
        # fails a NOT NULL constraint on tenant_id.
        with tenant_context(self.tenant):
            cat, created = Category.objects.get_or_create(name="Supplements")
        self.assertTrue(created)
        self.assertEqual(cat.tenant_id, self.tenant.id)

    def test_get_or_create_second_call_finds_existing_row_in_same_tenant(self):
        with tenant_context(self.tenant):
            first, created_first = Category.objects.get_or_create(name="Supplements")
            second, created_second = Category.objects.get_or_create(name="Supplements")
        self.assertTrue(created_first)
        self.assertFalse(created_second)
        self.assertEqual(first.id, second.id)

    def test_get_or_create_does_not_leak_across_tenants(self):
        with tenant_context(self.tenant):
            a, _ = Category.objects.get_or_create(name="Supplements")
        with tenant_context(self.other_tenant):
            b, created = Category.objects.get_or_create(name="Supplements")
        self.assertTrue(created)  # tenant B doesn't see tenant A's row, so it makes its own
        self.assertNotEqual(a.id, b.id)

    def test_refresh_from_db_works_without_tenant_context(self):
        # Regression test: Model.refresh_from_db() uses _base_manager,
        # not `objects` — if _base_manager is left as the tenant-scoped
        # manager (the default, since `objects` is declared first),
        # this raises RuntimeError even though the caller already has a
        # concrete instance in hand and no tenant ambiguity exists.
        with tenant_context(self.tenant):
            cat = Category.objects.create(name="Devices")
        set_current_tenant(None)
        cat.refresh_from_db()  # must not raise
        self.assertEqual(cat.name, "Devices")

    def test_all_objects_bypasses_scoping_entirely(self):
        with tenant_context(self.tenant):
            Category.objects.create(name="Analgesics")
        with tenant_context(self.other_tenant):
            Category.objects.create(name="Antibiotics")

        set_current_tenant(None)
        names = set(Category.all_objects.values_list("name", flat=True))
        self.assertEqual(names, {"Analgesics", "Antibiotics"})

    def test_tenant_context_restores_previous_value_on_exit(self):
        set_current_tenant(self.tenant)
        with tenant_context(self.other_tenant):
            self.assertEqual(get_current_tenant(), self.other_tenant)
        self.assertEqual(get_current_tenant(), self.tenant)
        set_current_tenant(None)


class ActivityLogTests(TestCase):
    def setUp(self):
        self.tenant = Tenant.objects.create(name="Tenant A", slug="activity-test-a", tenant_type=Tenant.RETAIL)

    def tearDown(self):
        set_current_tenant(None)

    def test_log_activity_records_tenant_and_user(self):
        from django.contrib.auth import get_user_model
        from core.activity import log_activity
        from core.models import ActivityLog

        User = get_user_model()
        user = User.objects.create_user(username="logtest", password="x", tenant=self.tenant)

        class FakeRequest:
            pass

        req = FakeRequest()
        req.user = user

        with tenant_context(self.tenant):
            log_activity(req, "product.created", "Created product Test Widget")
            entry = ActivityLog.objects.get()

        self.assertEqual(entry.action, "product.created")
        self.assertEqual(entry.user_id, user.id)
        self.assertEqual(entry.tenant_id, self.tenant.id)
