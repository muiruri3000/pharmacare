from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from .models import User


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    list_display = ("username", "email", "role", "tenant", "is_active_employee", "is_staff")
    list_filter = ("role", "tenant", "is_active_employee")
    fieldsets = DjangoUserAdmin.fieldsets + (
        ("Pharmacy", {"fields": ("role", "tenant", "phone", "is_active_employee")}),
    )
