from datetime import date, timedelta

from core.context import tenant_context
from core.test_utils import TenantAPITestCase
from inventory.models import Product, Batch
from sales.models import Customer


class PrescriptionFlowTests(TenantAPITestCase):
    def setUp(self):
        super().setUp()
        with tenant_context(self.tenant):
            self.product = Product.objects.create(
                name="Amoxicillin 250mg", sku="AMOX250", unit="capsule", requires_prescription=True,
                cost_price=1, wholesale_price=2, retail_price=4, reorder_level=10,
            )
            self.batch_old = Batch.objects.create(
                product=self.product, batch_number="OLD",
                expiry_date=date.today() + timedelta(days=10), quantity=5, cost_price=1,
            )
            self.batch_new = Batch.objects.create(
                product=self.product, batch_number="NEW",
                expiry_date=date.today() + timedelta(days=200), quantity=50, cost_price=1,
            )
            self.customer = Customer.objects.create(name="Jane Doe", customer_type=Customer.WALK_IN)

    def _log_prescription(self, quantity=8):
        self.login_as(self.sales)
        res = self.client.post("/api/prescriptions/", {
            "customer": self.customer.id,
            "prescribed_by": "Dr. Smith",
            "items": [{"product": self.product.id, "quantity": quantity, "dosage_instructions": "1 cap 3x daily"}],
        }, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        return res.data

    def test_sales_can_log_but_not_dispense(self):
        rx = self._log_prescription()
        self.assertEqual(rx["status"], "pending")
        res = self.client.post(f"/api/prescriptions/{rx['id']}/dispense/")
        self.assertEqual(res.status_code, 403)

    def test_technician_dispense_deducts_stock_fefo(self):
        rx = self._log_prescription(quantity=8)  # 5 from OLD + 3 from NEW
        self.login_as(self.tech)
        res = self.client.post(f"/api/prescriptions/{rx['id']}/dispense/")
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(res.data["status"], "dispensed")
        self.assertTrue(all(i["dispensed"] for i in res.data["items"]))

        self.batch_old.refresh_from_db()
        self.batch_new.refresh_from_db()
        self.assertEqual(self.batch_old.quantity, 0)
        self.assertEqual(self.batch_new.quantity, 47)

    def test_dispense_insufficient_stock_rejected_and_rolled_back(self):
        rx = self._log_prescription(quantity=1000)
        self.login_as(self.tech)
        res = self.client.post(f"/api/prescriptions/{rx['id']}/dispense/")
        self.assertEqual(res.status_code, 400)

        self.batch_old.refresh_from_db()
        self.batch_new.refresh_from_db()
        self.assertEqual(self.batch_old.quantity, 5)   # nothing deducted
        self.assertEqual(self.batch_new.quantity, 50)

    def test_cannot_dispense_twice(self):
        rx = self._log_prescription(quantity=1)
        self.login_as(self.tech)
        self.client.post(f"/api/prescriptions/{rx['id']}/dispense/")
        res = self.client.post(f"/api/prescriptions/{rx['id']}/dispense/")
        self.assertEqual(res.status_code, 400)

    def test_admin_can_dispense(self):
        rx = self._log_prescription(quantity=1)
        self.login_as(self.admin)
        res = self.client.post(f"/api/prescriptions/{rx['id']}/dispense/")
        self.assertEqual(res.status_code, 200)

    def test_tenant_isolation(self):
        self._log_prescription()
        self.login_as(self.other_admin)
        res = self.client.get("/api/prescriptions/")
        self.assertEqual(len(self.rows(res.data)), 0)
