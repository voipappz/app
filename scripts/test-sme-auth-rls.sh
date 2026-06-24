#!/bin/bash

# Test Runner for sales_agent_sme Authentication and RLS Tests
#
# This script runs comprehensive tests to verify that:
# 1. Authentication works properly for the sales_agent_sme role
# 2. Role-based permissions are correctly enforced
# 3. RLS policies protect data appropriately
# 4. The ACL service functions correctly

set -e

echo "🧪 Running sales_agent_sme Authentication & RLS Tests"
echo "=================================================="

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Load environment variables from .env file if it exists
if [ -f .env ]; then
    echo -e "${YELLOW}📁 Loading environment variables from .env file${NC}"
    export $(grep -v '^#' .env | xargs)
fi

# Check if required environment variables are set
if [ -z "$VITE_SUPABASE_URL" ] || [ -z "$VITE_SUPABASE_ANON_KEY" ]; then
    echo -e "${RED}❌ Error: Required Supabase environment variables not set${NC}"
    echo "Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY"
    echo ""
    echo "Either:"
    echo "  1. Create a .env file with the variables (copy from .env.example)"
    echo "  2. Export them in your shell:"
    echo "     export VITE_SUPABASE_URL='https://xxx.supabase.co'"
    echo "     export VITE_SUPABASE_ANON_KEY='xxx'"
    echo "  3. Set them before running: VITE_SUPABASE_URL=xxx make test-sme"
    echo ""
    echo "Optional: SUPABASE_SERVICE_ROLE_KEY for advanced RLS testing"
    exit 1
fi

echo -e "${GREEN}✅ Environment variables configured${NC}"

# Function to run test with error handling
run_test() {
    local test_file=$1
    local test_name=$2

    echo ""
    echo -e "${YELLOW}🧪 Running: ${test_name}${NC}"
    echo "----------------------------------------"

    if npx playwright test "$test_file" --reporter=dot; then
        echo -e "${GREEN}✅ PASSED: ${test_name}${NC}"
        return 0
    else
        echo -e "${RED}❌ FAILED: ${test_name}${NC}"
        return 1
    fi
}

# Track test results
failed_tests=0

# 1. Run RBAC tests (basic role access)
if ! run_test "tests/rbac.spec.ts" "Role-Based Access Control (RBAC)"; then
    ((failed_tests++))
fi

# 2. Run comprehensive authentication and permission tests
if ! run_test "tests/sales-agent-sme-auth-rls.spec.ts" "Comprehensive Auth & Permissions"; then
    ((failed_tests++))
fi

# 3. Run ACL service unit tests
if ! run_test "tests/unit/acl-service-sme.spec.ts" "ACL Service Logic"; then
    ((failed_tests++))
fi

# 4. Run RLS policy tests
if ! run_test "tests/unit/rls-policies-sme.spec.ts" "Row Level Security Policies"; then
    ((failed_tests++))
fi

# Summary
echo ""
echo "=================================================="
echo "🧪 Test Summary for sales_agent_sme Role"
echo "=================================================="

if [ $failed_tests -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed! Authentication and RLS are properly configured.${NC}"
    echo ""
    echo "Key validations completed:"
    echo "  • Role authentication works correctly"
    echo "  • Route protection follows permission rules"
    echo "  • UI elements respect role permissions"
    echo "  • ACL service logic functions properly"
    echo "  • RLS policies protect database access"
    echo "  • sales_agent_sme can edit prices (vs SMB agents)"
    echo "  • Installation access is properly blocked"
else
    echo -e "${RED}❌ ${failed_tests} test suite(s) failed${NC}"
    echo ""
    echo "Please review the test output above to identify issues:"
    echo "  • Authentication configuration problems"
    echo "  • Permission setup errors"
    echo "  • RLS policy issues"
    echo "  • ACL service bugs"

    exit 1
fi

# Additional information
echo ""
echo "=================================================="
echo "ℹ️  Additional Testing Recommendations"
echo "=================================================="
echo ""
echo "Manual verification steps:"
echo "  1. Log in as a sales_agent_sme user in the UI"
echo "  2. Verify you can access Orders and Customers sections"
echo "  3. Confirm you can edit order prices (key SME feature)"
echo "  4. Verify you CANNOT access Installation sections"
echo "  5. Test that menu items show/hide correctly"
echo ""
echo "Security verification:"
echo "  1. Check that unauthenticated API calls are blocked"
echo "  2. Verify cross-tenant data access is prevented"
echo "  3. Confirm RLS is enabled on all critical tables"
echo ""
echo "Performance testing:"
echo "  1. Test with realistic data volumes"
echo "  2. Check query performance with RLS enabled"
echo "  3. Monitor for any permission check bottlenecks"
echo ""

# If service role key is available, suggest additional tests
if [ -n "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo "🔧 Advanced testing (service role available):"
    echo "  • Database-level RLS enforcement"
    echo "  • Direct SQL policy validation"
    echo "  • Cross-user data isolation testing"
else
    echo "💡 For enhanced RLS testing, set SUPABASE_SERVICE_ROLE_KEY"
fi

echo ""
echo -e "${GREEN}🎉 sales_agent_sme testing complete!${NC}"