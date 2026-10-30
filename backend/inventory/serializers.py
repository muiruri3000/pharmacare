from rest_framework import serializers
from .models import Category, Product, Batch, StockMovement


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ["id", "name", "description"]

    def validate_name(self, value):
        # The DB constraint is unique_together(tenant, name), but DRF's
        # automatic uniqueness validation can't see it: `tenant` isn't a
        # field on this serializer at all (it's injected server-side from
        # request context, never sent by the client), so DRF has no way
        # to build the validator. Without this, a duplicate name hits the
        # database directly and surfaces as a raw IntegrityError/500
        # instead of a clean 400. Product.objects is already tenant-scoped,
        # so this check is automatically scoped to the same tenant as the
        # DB constraint.
        qs = Category.objects.filter(name=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A category with this name already exists.")
        return value


class ProductSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True, default=None)
    quantity_on_hand = serializers.IntegerField(read_only=True)
    is_low_stock = serializers.BooleanField(read_only=True)

    class Meta:
        model = Product
        fields = [
            "id", "name", "sku", "barcode", "category", "category_name", "manufacturer", "unit",
            "requires_prescription", "cost_price", "wholesale_price", "retail_price",
            "reorder_level", "is_active", "quantity_on_hand", "is_low_stock", "created_at",
        ]
        read_only_fields = ["id", "created_at"]

    def validate_sku(self, value):
        # Same gap as Category.validate_name above — unique_together(tenant, sku)
        # is invisible to DRF's auto-validation since `tenant` isn't a serializer field.
        qs = Product.objects.filter(sku=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A product with this SKU already exists.")
        return value

    def validate_barcode(self, value):
        if not value:
            return value  # blank barcodes are exempt from the DB constraint too (see Product.Meta)
        qs = Product.objects.filter(barcode=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A product with this barcode already exists.")
        return value


class BatchSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    supplier_name = serializers.CharField(source="supplier.name", read_only=True, default=None)
    is_expired = serializers.BooleanField(read_only=True)

    class Meta:
        model = Batch
        fields = [
            "id", "product", "product_name", "batch_number", "expiry_date", "quantity",
            "cost_price", "supplier", "supplier_name", "received_date", "is_expired",
        ]
        read_only_fields = ["id", "received_date"]


class StockMovementSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    created_by_name = serializers.CharField(source="created_by.username", read_only=True, default=None)

    class Meta:
        model = StockMovement
        fields = [
            "id", "product", "product_name", "batch", "movement_type", "quantity",
            "reason", "reference", "created_by", "created_by_name", "created_at",
        ]
        # movement_type is always decided by the view (IN on receive,
        # OUT on sale/dispense, ADJUSTMENT on manual entry) — never by
        # the caller. Leaving it writable made it a *required* field
        # (no default on the model), which the frontend never sends,
        # so every manual adjustment would 400 with "this field is
        # required" before it ever reached the view's own logic.
        read_only_fields = ["id", "movement_type", "created_by", "created_at"]
