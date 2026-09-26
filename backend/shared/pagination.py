"""Pagination shared by every API endpoint (SAD section 6.1)."""

from rest_framework.pagination import PageNumberPagination


class DefaultPagination(PageNumberPagination):
    """Page-number pagination; clients may request up to 100 items per page."""

    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100
