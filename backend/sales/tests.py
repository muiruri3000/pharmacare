from datetime import date, timedelta
from decimal import Decimal

from core.context import tenant_context
from core.test_utils import TenantAPITestCase
from inventory.models import Product, Batch
from sales.models import Customer, Sale


class SalesFlowTests(TenantAPITestCase):
    def setUp(self):
        super().setUp()
        with tenant_context(self.tenant):
            self.product = Product.objects.create(
                name="Paracetamol 500mg", sku="PARA500", unit="tablet",
                cost_price=2, wholesale_price=3.5, retail_price=6, reorder_level=10,
            )
            # Deliberately: OLD has less stock than a typical order, so a
            # sale spanning both batches (and therefore FEFO + the void
            # regression test) is easy to trigger.
            self.batch_old = Batch.objects.create(
                product=self.product, batch_number="OLD",
                expiry_date=date.today() + timedelta(days=10), quantity=5, cost_price=2,
            )
            self.batch_new = Batch.objects.create(
                product=self.product, batch_number="NEW",
                expiry_date=date.today() + timedelta(days=365), quantity=50, cost_price=2,
            )
            Customer.objects.create(name="Jane Doe", customer_type=Customer.WALK_IN)

        with tenant_context(self.wholesale_tenant):
            self.w_product = Product.objects.create(
                name="Amoxicillin 250mg", sku="AMOX250", unit="capsule",
                cost_price=1, wholesale_price=2, retail_price=4, reorder_level=10,
            )
            Batch.objects.create(
                product=self.w_product, batch_number="W1",
                expiry_date=date.today() + timedelta(days=200), quantity=100, cost_price=1,
            )

    def test_sale_uses_retail_price_for_retail_tenant(self):
        self.login_as(self.sales)
        res = self.client.post("/api/sales/", {
            "payment_method": "cash", "discount": 0, "tax": 0,
            "items": [{"product": self.product.id, "quantity": 2}],
        }, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(Decimal(res.data["items"][0]["unit_price"]), Decimal("6.00"))
        self.assertEqual(Decimal(res.data["total"]), Decimal("12.00"))

    def test_sale_uses_wholesale_price_for_wholesale_tenant(self):
        self.login_as(self.wholesale_admin)
        res = self.client.post("/api/sales/", {
            "payment_method": "cash", "discount": 0, "tax": 0,
            "items": [{"product": self.w_product.id, "quantity": 3}],
        }, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(Decimal(res.data["items"][0]["unit_price"]), Decimal("2.00"))
        self.assertEqual(Decimal(res.data["total"]), Decimal("6.00"))

    def test_explicit_zero_unit_price_is_preserved(self):
        # Regression test: `unit_price or default_price` used to treat
        # an explicit 0 as "not provided" (Python falsy) and silently
        # re-price a deliberately free/promo item.
        self.login_as(self.admin)
        res = self.client.post("/api/sales/", {
            "payment_method": "cash", "discount": 0, "tax": 0,
            "items": [{"product": self.product.id, "quantity": 1, "unit_price": "0.00"}],
        }, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(Decimal(res.data["items"][0]["unit_price"]), Decimal("0.00"))

    def test_sale_deducts_fefo_across_batches(self):
        self.login_as(self.sales)
        # 5 in OLD (expires soonest) + 50 in NEW; buying 8 should take
        # all 5 from OLD then 3 from NEW.
        res = self.client.post("/api/sales/", {
            "payment_method": "cash", "discount": 0, "tax": 0,
            "items": [{"product": self.product.id, "quantity": 8}],
        }, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        self.batch_old.refresh_from_db()
        self.batch_new.refresh_from_db()
        self.assertEqual(self.batch_old.quantity, 0)
        self.assertEqual(self.batch_new.quantity, 47)

    def test_sale_insufficient_stock_rejected_and_rolled_back(self):
        self.login_as(self.sales)
        res = self.client.post("/api/sales/", {
            "payment_method": "cash", "discount": 0, "tax": 0,
            "items": [{"product": self.product.id, "quantity": 1000}],
        }, format="json")
        self.assertEqual(res.status_code, 400)
        self.batch_old.refresh_from_db()
        self.batch_new.refresh_from_db()
        self.assertEqual(self.batch_old.quantity, 5)
        self.assertEqual(self.batch_new.quantity, 50)
        with tenant_context(self.tenant):
            self.assertEqual(Sale.objects.count(), 0)  # failed sale wasn't left dangling

    def test_void_restores_stock_split_across_multiple_batches(self):
        # Regression test: void() used to restore quantity only to
        # SaleItem.batch — the FIRST batch a line item was drawn from —
        # so a sale that FEFO-split across two batches would, on void,
        # over-credit the first batch and never restore the second.
        self.login_as(self.sales)
        res = self.client.post("/api/sales/", {
            "payment_method": "cash", "discount": 0, "tax": 0,
            "items": [{"product": self.product.id, "quantity": 8}],  # 5 from OLD + 3 from NEW
        }, format="json")
        sale_id = res.data["id"]
        self.batch_old.refresh_from_db()
        self.batch_new.refresh_from_db()
        self.assertEqual(self.batch_old.quantity, 0)
        self.assertEqual(self.batch_new.quantity, 47)

        self.login_as(self.admin)
        res = self.client.post(f"/api/sales/{sale_id}/void/")
        self.assertEqual(res.status_code, 200, res.data)

        self.batch_old.refresh_from_db()
        self.batch_new.refresh_from_db()
        self.assertEqual(self.batch_old.quantity, 5, "OLD batch should be fully restored")
        self.assertEqual(self.batch_new.quantity, 50, "NEW batch should be fully restored, not left at 47")

    def test_cannot_void_twice(self):
        self.login_as(self.sales)
        res = self.client.post("/api/sales/", {
            "payment_method": "cash", "discount": 0, "tax": 0,
            "items": [{"product": self.product.id, "quantity": 1}],
        }, format="json")
        sale_id = res.data["id"]
        self.login_as(self.admin)
        self.client.post(f"/api/sales/{sale_id}/void/")
        res = self.client.post(f"/api/sales/{sale_id}/void/")
        self.assertEqual(res.status_code, 400)

    def test_only_admin_can_void(self):
        self.login_as(self.sales)
        res = self.client.post("/api/sales/", {
            "payment_method": "cash", "discount": 0, "tax": 0,
            "items": [{"product": self.product.id, "quantity": 1}],
        }, format="json")
        sale_id = res.data["id"]
        res = self.client.post(f"/api/sales/{sale_id}/void/")
        self.assertEqual(res.status_code, 403)

    def test_technician_cannot_create_sale(self):
        self.login_as(self.tech)
        res = self.client.post("/api/sales/", {
            "payment_method": "cash", "discount": 0, "tax": 0,
            "items": [{"product": self.product.id, "quantity": 1}],
        }, format="json")
        self.assertEqual(res.status_code, 403)

    def test_technician_can_view_sales(self):
        self.login_as(self.tech)
        res = self.client.get("/api/sales/")
        self.assertEqual(res.status_code, 200)

    def test_sales_cannot_delete_a_sale(self):
        # SaleViewSet excludes DELETE from http_method_names entirely,
        # but DRF checks permissions before it checks allowed methods —
        # so a role the permission class already blocks gets 403, not
        # 405, regardless of what the viewset would otherwise allow.
        self.login_as(self.sales)
        res = self.client.post("/api/sales/", {
            "payment_method": "cash", "discount": 0, "tax": 0,
            "items": [{"product": self.product.id, "quantity": 1}],
        }, format="json")
        sale_id = res.data["id"]
        res = self.client.delete(f"/api/sales/{sale_id}/")
        self.assertEqual(res.status_code, 403)

    def test_tenant_isolation(self):
        self.login_as(self.sales)
        self.client.post("/api/sales/", {
            "payment_method": "cash", "discount": 0, "tax": 0,
            "items": [{"product": self.product.id, "quantity": 1}],
        }, format="json")
        self.login_as(self.other_admin)
        res = self.client.get("/api/sales/")
        self.assertEqual(len(self.rows(res.data)), 0)
