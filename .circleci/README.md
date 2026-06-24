# CircleCI Configuration Files

This directory contains CircleCI configuration files for the VoipAppz Dashboard project.

## Files

### `config.yml` (Main Configuration)
The primary CircleCI configuration that integrates Cypress testing with the existing build and deployment pipeline.

**Features:**
- ✅ Cypress test integration
- ✅ Docker deployment pipeline
- ✅ Multi-branch workflows
- ✅ Parallel test execution
- ✅ Comprehensive caching
- ✅ Artifact collection

### `continue_config.yml` (Advanced Patterns)
Demonstrates advanced CircleCI patterns for complex scenarios:
- Matrix testing across Node versions
- Conditional workflows
- Performance testing jobs
- Security testing integration
- Database integration testing
- Slack notifications

**Note:** This is for reference and future enhancements. The main `config.yml` is the active configuration.

## Quick Start

1. **Connect to CircleCI**: Link your GitHub repository to CircleCI
2. **Environment Variables**: Set `DOCKER_PASS` for deployment
3. **Branch Strategy**: Push to `dev-claude` to trigger feature testing workflow

## Workflow Triggers

### Automatic Triggers
- **Push to `master`**: Full build + deploy
- **Push to `dev/*`**: Full build + test
- **Push to `feature/*`**: Testing only
- **Push to `dev-claude`**: Enhanced testing

### Manual Triggers
- **Performance tests**: Requires approval on release branches
- **Nightly tests**: Scheduled at 2 AM UTC

## Test Results

### CircleCI Interface
- Navigate to your project in CircleCI
- View test results under "Tests" tab
- Download artifacts (screenshots, videos, reports)

### Local Development
```bash
# Run the same tests locally
npm run test:cypress

# Interactive mode
npm run test:cypress:open
```

## Troubleshooting

### Common Issues
1. **Missing environment variables**: Set `DOCKER_PASS` in CircleCI project settings
2. **Cache issues**: Clear cache in CircleCI project settings if builds fail
3. **Node version conflicts**: Configuration handles Angular 7 + Node compatibility

### Debug Mode
- SSH into failed builds using CircleCI CLI
- Check build logs for detailed error information
- Review artifacts for visual test evidence

## Migration from Legacy Config

The new configuration maintains 100% backward compatibility:
- ✅ All existing Docker deployment functionality preserved
- ✅ Same branch filters and deployment targets
- ✅ Enhanced with comprehensive testing
- ✅ No breaking changes to existing workflows

## Future Enhancements

When the Angular dev server is stable:
1. Enable full E2E testing
2. Add visual regression testing
3. Implement cross-browser testing matrix
4. Add performance benchmarking

## Support

For questions about the CircleCI configuration:
1. Check the main documentation: `../CIRCLECI.md`
2. Review test setup: `../TESTING.md`
3. Validate configuration: `circleci config validate`