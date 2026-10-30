from rest_framework import serializers
from .models import Customer, Sale, SaleItem


class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = ["id", "name", "phone", "email", "customer_type", "credit_limit"]


class SaleItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    subtotal = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = SaleItem
        fields = ["id", "product", "product_name", "batch", "quantity", "unit_price", "subtotal"]
        # unit_price is optional on write — SaleViewSet fills it in from the
        # product's tenant-appropriate price (wholesale/retail) when omitted.
        extra_kwargs = {"unit_price": {"required": False}}


class SaleSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.name", read_only=True, default=None)
    sold_by_name = serializers.CharField(source="sold_by.username", read_only=True, default=None)
    items = SaleItemSerializer(many=True)
    subtotal = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    total = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta:
        model = Sale
        fields = [
            "id", "customer", "customer_name", "sold_by", "sold_by_name", "status",
            "payment_method", "discount", "tax", "prescription", "created_at",
            "items", "subtotal", "total",
        ]
        read_only_fields = ["id", "sold_by", "created_at"]
