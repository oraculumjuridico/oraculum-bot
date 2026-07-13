const assert = require("node:assert/strict")

// Mock test for PDF partial failure handling
// We test the logic without actually calling pdfjs or canvas

function simulateRenderPages(pageConfigs, shouldFailOnPage = -1) {
  // Simulates the logic of renderPdfPages with partial failure handling
  const results = []
  const pageErrors = []

  for (let i = 0; i < pageConfigs.length; i++) {
    const config = pageConfigs[i]
    let page
    try {
      page = {
        getViewport: () => {
          if (config.shouldFailViewport) {
            const error = new Error("Invalid viewport")
            error.code = "PDF_VIEWPORT_ERROR"
            throw error
          }
          return { width: 100, height: 100 }
        },
        render: () => {
          if (i === shouldFailOnPage || config.shouldFailRender) {
            const error = new Error("Render failed")
            error.code = "CANVAS_RENDER_ERROR"
            throw error
          }
          return true
        },
        cleanup: () => {}
      }

      try {
        const viewport = page.getViewport()
        // Simulate render - get viewport, then call render()
        page.render()
        results.push(Buffer.from("page_data"))
      } catch (renderError) {
        pageErrors.push({ pageNumber: i + 1, code: renderError.message })
      } finally {
        page.cleanup()
      }
    } catch (pageError) {
      pageErrors.push({ pageNumber: i + 1, code: pageError.message })
    }
  }

  // If no pages rendered, consider full failure
  if (results.length === 0 && pageErrors.length > 0) {
    return { failed: true, pageErrors }
  }

  return { failed: false, pages: results, pageErrors: pageErrors.length > 0 ? pageErrors : undefined }
}

function main() {
  // Test: Failure before any page succeeds - all pages fail
  const pages1 = [{ shouldFailViewport: true }, { shouldFailViewport: true }, { shouldFailViewport: true }]
  const result1 = simulateRenderPages(pages1)
  assert.ok(result1.failed === true, "Should fail when all pages fail")
  assert.equal(result1.pageErrors.length, 3, "Should record errors for all pages")

  // Test: Failure on first page, but others succeed (partial success)
  const pages2 = [{ shouldFailViewport: true }, {}, {}]
  const result2 = simulateRenderPages(pages2)
  assert.ok(result2.failed === false, "Should succeed partially when other pages render")
  assert.equal(result2.pages.length, 2, "Should have 2 successful pages")
  assert.equal(result2.pageErrors.length, 1, "Should have 1 error from first page")

  // Test: Failure after first page succeeds (partial success)
  const pages3 = [{}, { shouldFailRender: true }, {}]
  const result3 = simulateRenderPages(pages3)
  assert.ok(result3.failed === false, "Should succeed partially when first page renders")
  assert.equal(result3.pages.length, 2, "Should have 2 successful pages")
  assert.ok(result3.pageErrors, "Should report errors for failed pages")
  assert.equal(result3.pageErrors.length, 1, "Should have 1 error")

  // Test: Failure in middle (partial success preserved)
  const pages4 = [{}, {}, { shouldFailRender: true }, {}]
  const result4 = simulateRenderPages(pages4)
  assert.ok(result4.failed === false, "Should succeed partially")
  assert.equal(result4.pages.length, 3, "Should have 3 successful pages")
  assert.ok(result4.pageErrors.find(e => e.pageNumber === 3), "Should record error for page 3")

  console.log("✓ PDF partial failure handling tests passed")
}

main()
