from rest_framework import serializers
from .models import Prescription, PrescriptionItem


class PrescriptionItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)

    class Meta:
        model = PrescriptionItem
        fields = ["id", "product", "product_name", "quantity", "dosage_instructions", "dispensed"]


class PrescriptionSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.name", read_only=True, default=None)
    created_by_name = serializers.CharField(source="created_by.username", read_only=True, default=None)
    dispensed_by_name = serializers.CharField(source="dispensed_by.username", read_only=True, default=None)
    items = PrescriptionItemSerializer(many=True)

    class Meta:
        model = Prescription
        fields = [
            "id", "customer", "customer_name", "prescribed_by", "notes", "status",
            "created_by", "created_by_name", "dispensed_by", "dispensed_by_name",
            "created_at", "items",
        ]
        read_only_fields = ["id", "created_by", "dispensed_by", "created_at"]

    def create(self, validated_data):
        items_data = validated_data.pop("items")
        rx = Prescription.objects.create(**validated_data)
        for item in items_data:
            PrescriptionItem.objects.create(prescription=rx, **item)
        return rx
