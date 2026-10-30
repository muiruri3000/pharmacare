from datetime import date, timedelta

from django.db.models import Sum

from core.context import tenant_context
from core.test_utils import TenantAPITestCase
from inventory.models import Product, Batch, StockMovement
from purchasing.models import Supplier


class PurchaseOrderFlowTests(TenantAPITestCase):
    def setUp(self):
        super().setUp()
        with tenant_context(self.tenant):
            self.supplier = Supplier.objects.create(name="MedSource Ltd", phone="+254700000000")
            self.product_a = Product.objects.create(
                name="Paracetamol 500mg", sku="PARA500", unit="tablet",
                cost_price=2, wholesale_price=3.5, retail_price=6, reorder_level=10,
            )
            self.product_b = Product.objects.create(
                name="Amoxicillin 250mg", sku="AMOX250", unit="capsule",
                cost_price=1, wholesale_price=2, retail_price=4, reorder_level=10,
            )

    def _create_po(self):
        self.login_as(self.tech)
        res = self.client.post("/api/purchase-orders/", {
            "supplier": self.supplier.id,
            "items": [
                {"product": self.product_a.id, "quantity": 100, "unit_cost": "2.00"},
                {"product": self.product_b.id, "quantity": 50, "unit_cost": "1.00"},
            ],
        }, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        return res.data

    def test_create_purchase_order_with_items(self):
        po = self._create_po()
        self.assertEqual(po["status"], "draft")
        self.assertEqual(len(po["items"]), 2)

    def test_sales_role_cannot_create_purchase_order(self):
        self.login_as(self.sales)
        res = self.client.post("/api/purchase-orders/", {
            "supplier": self.supplier.id,
            "items": [{"product": self.product_a.id, "quantity": 10, "unit_cost": "2.00"}],
        }, format="json")
        self.assertEqual(res.status_code, 403)

    def test_receive_creates_batches_and_stock_movements_and_updates_quantity_on_hand(self):
        po = self._create_po()
        item_a_id = next(i["id"] for i in po["items"] if i["product"] == self.product_a.id)
        item_b_id = next(i["id"] for i in po["items"] if i["product"] == self.product_b.id)

        res = self.client.post(f"/api/purchase-orders/{po['id']}/receive/", {
            "batches": [
                {"item_id": item_a_id, "batch_number": "A1", "expiry_date": str(date.today() + timedelta(days=300))},
                {"item_id": item_b_id, "batch_number": "B1", "expiry_date": str(date.today() + timedelta(days=180))},
            ],
        }, format="json")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["status"], "received")

        with tenant_context(self.tenant):
            batch_a = Batch.objects.get(product=self.product_a, batch_number="A1")
            batch_b = Batch.objects.get(product=self.product_b, batch_number="B1")
            self.assertEqual(batch_a.quantity, 100)
            self.assertEqual(batch_b.quantity, 50)
            self.assertEqual(
                StockMovement.objects.filter(reference=f"PO-{po['id']}", movement_type=StockMovement.IN).count(), 2
            )

        self.login_as(self.admin)
        res = self.client.get(f"/api/products/{self.product_a.id}/")
        self.assertEqual(res.data["quantity_on_hand"], 100)

    def test_receive_without_expiry_date_is_rejected_cleanly(self):
        po = self._create_po()
        item_a_id = po["items"][0]["id"]
        res = self.client.post(f"/api/purchase-orders/{po['id']}/receive/", {
            "batches": [{"item_id": item_a_id, "batch_number": "A1"}],  # no expiry_date at all
        }, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertNotIn("Traceback", str(res.data))  # a clean validation error, not a 500

        with tenant_context(self.tenant):
            self.assertEqual(Batch.objects.filter(batch_number="A1").count(), 0)  # nothing partially created

    def test_cannot_receive_the_same_order_twice(self):
        po = self._create_po()
        batches_payload = {
            "batches": [
                {
                    "item_id": item["id"],
                    "batch_number": f"B{item['id']}",
                    "expiry_date": str(date.today() + timedelta(days=300)),
                }
                for item in po["items"]
            ]
        }
        res = self.client.post(f"/api/purchase-orders/{po['id']}/receive/", batches_payload, format="json")
        self.assertEqual(res.status_code, 200)

        res = self.client.post(f"/api/purchase-orders/{po['id']}/receive/", batches_payload, format="json")
        self.assertEqual(res.status_code, 400)
        with tenant_context(self.tenant):
            # confirms the second (rejected) call didn't double the stock
            total = Batch.objects.filter(product=self.product_a).aggregate(total=Sum("quantity"))["total"]
            self.assertEqual(total, 100)

    def test_tenant_isolation_suppliers(self):
        self.login_as(self.other_admin)
        res = self.client.get("/api/suppliers/")
        self.assertEqual(len(self.rows(res.data)), 0)
