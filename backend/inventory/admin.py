from django.contrib import admin
from .models import Category, Product, Batch, StockMovement

admin.site.register(Category)
admin.site.register(Product)
admin.site.register(Batch)
admin.site.register(StockMovement)
