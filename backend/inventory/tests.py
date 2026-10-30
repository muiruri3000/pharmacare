from datetime import date, timedelta

from core.context import tenant_context
from core.test_utils import TenantAPITestCase
from inventory.models import Category, Product, Batch, StockMovement


class ProductTests(TenantAPITestCase):
    def setUp(self):
        super().setUp()
        with tenant_context(self.tenant):
            self.category = Category.objects.create(name="Analgesics")
            self.product = Product.objects.create(
                name="Paracetamol 500mg", sku="PARA500", category=self.category, unit="tablet",
                cost_price=2, wholesale_price=3.5, retail_price=6, reorder_level=50,
            )
            self.batch = Batch.objects.create(
                product=self.product, batch_number="B1",
                expiry_date=date.today() + timedelta(days=365), quantity=100, cost_price=2,
            )

    def test_sales_role_cannot_create_product(self):
        self.login_as(self.sales)
        res = self.client.post("/api/products/", {
            "name": "Ibuprofen", "sku": "IBU200", "unit": "tablet",
            "cost_price": "1", "wholesale_price": "2", "retail_price": "3", "reorder_level": 10,
        }, format="json")
        self.assertEqual(res.status_code, 403)

    def test_sales_role_can_view_products(self):
        self.login_as(self.sales)
        res = self.client.get("/api/products/")
        self.assertEqual(res.status_code, 200)

    def test_technician_can_create_but_not_delete_product(self):
        self.login_as(self.tech)
        res = self.client.post("/api/products/", {
            "name": "Ibuprofen", "sku": "IBU200", "unit": "tablet",
            "cost_price": "1", "wholesale_price": "2", "retail_price": "3", "reorder_level": 10,
        }, format="json")
        self.assertEqual(res.status_code, 201, res.data)

        res = self.client.delete(f"/api/products/{self.product.id}/")
        self.assertEqual(res.status_code, 403)

    def test_admin_delete_soft_deletes(self):
        self.login_as(self.admin)
        res = self.client.delete(f"/api/products/{self.product.id}/")
        self.assertEqual(res.status_code, 204)
        self.product.refresh_from_db()
        self.assertFalse(self.product.is_active)

    def test_quantity_on_hand_reflects_batches(self):
        self.login_as(self.admin)
        res = self.client.get(f"/api/products/{self.product.id}/")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["quantity_on_hand"], 100)
        self.assertFalse(res.data["is_low_stock"])  # 100 on hand, reorder_level 50

    def test_low_stock_filter_composes_with_ordering(self):
        # Regression test: low_stock=true used to return a plain Python
        # list instead of a queryset, which silently broke ?ordering=
        # (and would have broken pagination/search the same way).
        with tenant_context(self.tenant):
            Product.objects.create(
                name="Amoxicillin 250mg", sku="AMOX250", unit="capsule",
                cost_price=1, wholesale_price=2, retail_price=4, reorder_level=200,
            )  # zero batches -> 0 on hand -> below its 200 reorder level
        self.login_as(self.admin)
        res = self.client.get("/api/products/?low_stock=true&ordering=name")
        self.assertEqual(res.status_code, 200)
        names = [p["name"] for p in self.rows(res.data)]
        self.assertIn("Amoxicillin 250mg", names)
        self.assertNotIn("Paracetamol 500mg", names)

    def test_expiring_soon_respects_window(self):
        with tenant_context(self.tenant):
            Batch.objects.create(
                product=self.product, batch_number="B2",
                expiry_date=date.today() + timedelta(days=10), quantity=5, cost_price=2,
            )
        self.login_as(self.admin)
        res = self.client.get("/api/products/expiring_soon/?days=30")
        self.assertEqual(res.status_code, 200)
        batch_numbers = [b["batch_number"] for b in res.data]
        self.assertIn("B2", batch_numbers)
        self.assertNotIn("B1", batch_numbers)  # B1 expires in 365 days

    def test_tenant_isolation(self):
        self.login_as(self.other_admin)
        res = self.client.get("/api/products/")
        self.assertEqual(len(self.rows(res.data)), 0)
        res = self.client.get(f"/api/products/{self.product.id}/")
        self.assertEqual(res.status_code, 404)

    def test_cannot_reference_another_tenants_category(self):
        with tenant_context(self.other_tenant):
            foreign_category = Category.objects.create(name="Rival's category")
        self.login_as(self.admin)
        res = self.client.post("/api/products/", {
            "name": "Ibuprofen", "sku": "IBU200", "unit": "tablet", "category": foreign_category.id,
            "cost_price": "1", "wholesale_price": "2", "retail_price": "3", "reorder_level": 10,
        }, format="json")
        self.assertEqual(res.status_code, 400)  # PK-related field can't see another tenant's row

    def test_barcode_lookup_exact_match(self):
        with tenant_context(self.tenant):
            self.product.barcode = "6009123456789"
            self.product.save(update_fields=["barcode"])
        self.login_as(self.sales)
        res = self.client.get("/api/products/lookup_barcode/?code=6009123456789")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["id"], self.product.id)

    def test_barcode_lookup_falls_back_to_sku(self):
        # No barcode set on the product at all — scanning/typing the SKU
        # should still resolve it, since many pharmacies print SKU
        # labels before they have a real barcode catalogue.
        self.login_as(self.sales)
        res = self.client.get(f"/api/products/lookup_barcode/?code={self.product.sku}")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["id"], self.product.id)

    def test_barcode_lookup_not_found(self):
        self.login_as(self.sales)
        res = self.client.get("/api/products/lookup_barcode/?code=doesnotexist")
        self.assertEqual(res.status_code, 404)

    def test_barcode_lookup_does_not_leak_across_tenants(self):
        with tenant_context(self.other_tenant):
            Product.objects.create(
                name="Rival Product", sku="RIVAL1", barcode="1112223334445", unit="tablet",
                cost_price=1, wholesale_price=1, retail_price=1, reorder_level=10,
            )
        self.login_as(self.sales)  # logged into self.tenant
        res = self.client.get("/api/products/lookup_barcode/?code=1112223334445")
        self.assertEqual(res.status_code, 404)

    def test_duplicate_barcode_within_tenant_rejected(self):
        with tenant_context(self.tenant):
            self.product.barcode = "6009123456789"
            self.product.save(update_fields=["barcode"])
        self.login_as(self.admin)
        res = self.client.post("/api/products/", {
            "name": "Ibuprofen", "sku": "IBU200", "barcode": "6009123456789", "unit": "tablet",
            "cost_price": "1", "wholesale_price": "2", "retail_price": "3", "reorder_level": 10,
        }, format="json")
        self.assertEqual(res.status_code, 400)

    def test_blank_barcode_does_not_collide_across_products(self):
        # The unique constraint is conditional (barcode__gt="") specifically
        # so that many products can all have no barcode yet.
        self.login_as(self.admin)
        res = self.client.post("/api/products/", {
            "name": "Ibuprofen", "sku": "IBU200", "unit": "tablet",
            "cost_price": "1", "wholesale_price": "2", "retail_price": "3", "reorder_level": 10,
        }, format="json")
        self.assertEqual(res.status_code, 201, res.data)

    def test_duplicate_sku_within_tenant_rejected_cleanly(self):
        # Same class of bug as the barcode test above: unique_together(tenant, sku)
        # is invisible to DRF's auto-validation since `tenant` isn't a serializer
        # field, so without an explicit validate_sku() this hits the DB directly
        # and raises a raw IntegrityError instead of a clean 400.
        self.login_as(self.admin)
        res = self.client.post("/api/products/", {
            "name": "Generic Paracetamol", "sku": self.product.sku, "unit": "tablet",
            "cost_price": "1", "wholesale_price": "2", "retail_price": "3", "reorder_level": 10,
        }, format="json")
        self.assertEqual(res.status_code, 400)

    def test_duplicate_sku_allowed_across_different_tenants(self):
        self.login_as(self.other_admin)
        res = self.client.post("/api/products/", {
            "name": "Rival's Paracetamol", "sku": self.product.sku, "unit": "tablet",
            "cost_price": "1", "wholesale_price": "2", "retail_price": "3", "reorder_level": 10,
        }, format="json")
        self.assertEqual(res.status_code, 201, res.data)


class CategoryTests(TenantAPITestCase):
    def test_duplicate_category_name_within_tenant_rejected_cleanly(self):
        self.login_as(self.admin)
        with tenant_context(self.tenant):
            Category.objects.create(name="Analgesics")
        res = self.client.post("/api/categories/", {"name": "Analgesics"}, format="json")
        self.assertEqual(res.status_code, 400)

    def test_duplicate_category_name_allowed_across_different_tenants(self):
        with tenant_context(self.tenant):
            Category.objects.create(name="Analgesics")
        self.login_as(self.other_admin)
        res = self.client.post("/api/categories/", {"name": "Analgesics"}, format="json")
        self.assertEqual(res.status_code, 201, res.data)


class StockMovementTests(TenantAPITestCase):
    def setUp(self):
        super().setUp()
        with tenant_context(self.tenant):
            self.product = Product.objects.create(
                name="Paracetamol 500mg", sku="PARA500", unit="tablet",
                cost_price=2, wholesale_price=3.5, retail_price=6, reorder_level=10,
            )
            self.batch_old = Batch.objects.create(
                product=self.product, batch_number="OLD",
                expiry_date=date.today() + timedelta(days=10), quantity=20, cost_price=2,
            )
            self.batch_new = Batch.objects.create(
                product=self.product, batch_number="NEW",
                expiry_date=date.today() + timedelta(days=365), quantity=50, cost_price=2,
            )

    def test_positive_adjustment_requires_batch(self):
        # Regression test: a positive adjustment with no batch used to
        # be accepted and recorded as history without changing any
        # batch's quantity — i.e. it silently did nothing to real stock.
        self.login_as(self.admin)
        res = self.client.post("/api/stock-movements/", {
            "product": self.product.id, "quantity": 10, "reason": "count correction",
        }, format="json")
        self.assertEqual(res.status_code, 400)

    def test_positive_adjustment_with_batch_updates_quantity(self):
        self.login_as(self.admin)
        res = self.client.post("/api/stock-movements/", {
            "product": self.product.id, "batch": self.batch_new.id,
            "quantity": 10, "reason": "count correction",
        }, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        self.batch_new.refresh_from_db()
        self.assertEqual(self.batch_new.quantity, 60)

    def test_negative_adjustment_without_batch_draws_fefo(self):
        self.login_as(self.tech)
        res = self.client.post("/api/stock-movements/", {
            "product": self.product.id, "quantity": -25, "reason": "breakage",
        }, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        self.batch_old.refresh_from_db()
        self.batch_new.refresh_from_db()
        self.assertEqual(self.batch_old.quantity, 0)   # nearest-expiry batch drained first
        self.assertEqual(self.batch_new.quantity, 45)  # remainder from the next batch
        self.assertEqual(len(res.data), 2)  # one movement row per batch actually touched

    def test_negative_adjustment_insufficient_stock_rolls_back(self):
        self.login_as(self.admin)
        res = self.client.post("/api/stock-movements/", {
            "product": self.product.id, "quantity": -1000, "reason": "breakage",
        }, format="json")
        self.assertEqual(res.status_code, 400)
        self.batch_old.refresh_from_db()
        self.batch_new.refresh_from_db()
        self.assertEqual(self.batch_old.quantity, 20)
        self.assertEqual(self.batch_new.quantity, 50)

    def test_sales_role_cannot_create_stock_movement(self):
        self.login_as(self.sales)
        res = self.client.post("/api/stock-movements/", {
            "product": self.product.id, "batch": self.batch_new.id, "quantity": 5, "reason": "x",
        }, format="json")
        self.assertEqual(res.status_code, 403)

    def test_stock_movements_cannot_be_edited_or_deleted(self):
        self.login_as(self.admin)
        res = self.client.post("/api/stock-movements/", {
            "product": self.product.id, "batch": self.batch_new.id, "quantity": 5, "reason": "x",
        }, format="json")
        movement_id = res.data[0]["id"]
        self.assertEqual(self.client.delete(f"/api/stock-movements/{movement_id}/").status_code, 405)
        self.assertEqual(self.client.patch(f"/api/stock-movements/{movement_id}/", {}).status_code, 405)
