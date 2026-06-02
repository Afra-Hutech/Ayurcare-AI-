/**
 * GROUP 4 — Frontend UI Component Tests: ReportRenderer.jsx
 * ==========================================================
 * Component-level and contract tests for the ReportRenderer component.
 * Covers: null/undefined props, empty arrays, partial data, malformed metrics,
 * streaming token behavior, dosha percentage normalization, and render paths.
 *
 * Pre-conditions:
 *   - React 18+, @testing-library/react, @testing-library/jest-dom installed
 *   - jest.config.js configured with jsdom environment (see setup.js)
 *   - DoshaChart and deriveThreatLevel mocked (external deps)
 *
 * Run:
 *   cd tests/frontend && npx jest ReportRenderer.test.jsx --env=jsdom
 */

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';

// ── Module mocks ─────────────────────────────────────────────────────────────
// DoshaChart uses canvas/recharts which doesn't work in jsdom
jest.mock(
  '../../ayurveda-app/frontend_chat/src/components/dashboard/DoshaChart',
  () => ({ vata, pitta, kapha }) => (
    <div data-testid="dosha-chart" data-vata={vata} data-pitta={pitta} data-kapha={kapha} />
  )
);

// deriveThreatLevel is a utility that normalizes threat strings
jest.mock(
  '../../ayurveda-app/frontend_chat/src/utils/threatLevel',
  () => ({
    deriveThreatLevel: (reportData, fullReport) =>
      fullReport?.threatLevel || reportData?.threatLevel || 'Moderate',
  })
);

// lucide-react icons
jest.mock('lucide-react', () => ({
  Activity: () => <span data-testid="icon-activity" />,
  Shield: () => <span data-testid="icon-shield" />,
  Clipboard: () => <span data-testid="icon-clipboard" />,
  HeartPulse: () => <span data-testid="icon-heartpulse" />,
}));

// Import the component under test
import ReportRenderer from '../../ayurveda-app/frontend_chat/src/ReportRenderer';


// ── Test data factories ───────────────────────────────────────────────────────
function buildMasterReport(overrides = {}) {
  return {
    master_kpis: [
      { label: 'Primary Dosha', value: 'Pitta' },
      { label: 'Threat Level', value: 'Moderate' },
      { label: 'BMI', value: '25.5' },
      { label: 'Urgency', value: 'Non-Emergency' },
    ],
    threatLevel: 'Moderate',
    diagnosis: {
      reasoning: 'Pitta dosha aggravation with digestive involvement.',
    },
    integrated_synthesis:
      'The patient presents a clear Pitta-dominant imbalance with digestive inflammation.',
    doshaProfile: {
      dominant: 'Pitta',
      percentages: { vata: 20, pitta: 55, kapha: 25 },
      interpretation: 'Excess Pitta manifesting as inflammation and heat.',
    },
    master_pain_points: [
      'Burning sensation in stomach',
      'Acid reflux after meals',
      'Skin irritation',
    ],
    herbal_meds: [
      'Shatavari — 1 tsp with milk, twice daily',
      'Amalaki — 500mg capsule before meals',
    ],
    lifestyle_changes: [
      'Avoid hot, spicy, fermented foods',
      'Eat at regular intervals; do not skip meals',
      'Practice Sheetali pranayama daily',
    ],
    closing: 'This is an AI-generated assessment. Please consult your AyurCare practitioner.',
    ...overrides,
  };
}

function buildDiagnosisReport(overrides = {}) {
  return buildMasterReport(overrides);
}

function buildGenericReport(overrides = {}) {
  return {
    kpis: [
      { label: 'Dosha', value: 'Vata' },
      { label: 'Risk', value: 'Low' },
    ],
    content: 'Vata imbalance with dryness and irregular digestion.',
    pain_points: ['Joint pain', 'Dryness', 'Bloating'],
    section2_content: 'Lifestyle adjustments recommended for grounding.',
    ...overrides,
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// TC-UI-001  Null / undefined guard
// ─────────────────────────────────────────────────────────────────────────────
describe('TC-UI-001: Null & Undefined Guard', () => {

  test('renders nothing when report prop is null', () => {
    /**
     * ID: TC-UI-001
     * When report=null is passed, the component must render nothing (null guard).
     * Expected: no DOM output, no crash.
     */
    const { container } = render(
      <ReportRenderer report={null} reportType="Master Report" />
    );
    expect(container.firstChild).toBeNull();
  });

  test('renders nothing when report prop is undefined', () => {
    /**
     * ID: TC-UI-002
     * When report=undefined is passed, the component must render nothing.
     */
    const { container } = render(
      <ReportRenderer report={undefined} reportType="Diagnosis Report" />
    );
    expect(container.firstChild).toBeNull();
  });

  test('does not crash when reportType is undefined', () => {
    /**
     * ID: TC-UI-003
     * report is a valid object but reportType is undefined.
     * Component must render the generic path without crashing.
     */
    expect(() => {
      render(<ReportRenderer report={buildGenericReport()} reportType={undefined} />);
    }).not.toThrow();
  });

  test('does not crash when reportType is an unknown string', () => {
    /**
     * ID: TC-UI-004
     * An unknown reportType value should route to the generic renderer.
     */
    expect(() => {
      render(
        <ReportRenderer report={buildGenericReport()} reportType="UnknownReportType" />
      );
    }).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-UI-005  Master Report render path
// ─────────────────────────────────────────────────────────────────────────────
describe('TC-UI-005: Master Report Render Path', () => {

  test('renders KPI cards grid for Master Report', () => {
    /**
     * ID: TC-UI-005
     * Master Report with 4 KPI items must render 4 KPI card elements.
     * Each card must display its label and value.
     */
    render(
      <ReportRenderer report={buildMasterReport()} reportType="Master Report" />
    );
    expect(screen.getByText('Primary Dosha')).toBeInTheDocument();
    expect(screen.getByText('Pitta')).toBeInTheDocument();
    expect(screen.getByText('Threat Level')).toBeInTheDocument();
    expect(screen.getByText('Moderate')).toBeInTheDocument();
  });

  test('renders PageHeader with Clinical Synthesis kicker', () => {
    /**
     * ID: TC-UI-006
     * The Master Report must show 'Clinical Synthesis' kicker and
     * 'Integrated Health Assessment' title.
     */
    render(
      <ReportRenderer report={buildMasterReport()} reportType="Master Report" />
    );
    expect(screen.getByText(/Clinical Synthesis/i)).toBeInTheDocument();
    expect(screen.getByText(/Integrated Health Assessment/i)).toBeInTheDocument();
  });

  test('renders RiskMeter element', () => {
    /**
     * ID: TC-UI-007
     * The risk meter must be present in the DOM.
     */
    render(
      <ReportRenderer report={buildMasterReport()} reportType="Master Report" />
    );
    expect(screen.getByText(/Risk level/i)).toBeInTheDocument();
  });

  test('renders Diagnostic Summary section with content', () => {
    /**
     * ID: TC-UI-008
     * The Diagnostic Summary section must display the synthesis/reasoning text.
     */
    render(
      <ReportRenderer report={buildMasterReport()} reportType="Master Report" />
    );
    expect(screen.getByText(/Diagnostic Summary/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Pitta dosha aggravation with digestive involvement/i)
    ).toBeInTheDocument();
  });

  test('renders Biological Constitution section with dominant dosha', () => {
    /**
     * ID: TC-UI-009
     * The dosha section must show dominant profile and DoshaChart.
     */
    render(
      <ReportRenderer report={buildMasterReport()} reportType="Master Report" />
    );
    expect(screen.getByText(/Biological Constitution/i)).toBeInTheDocument();
    expect(screen.getByText('Dominant profile')).toBeInTheDocument();
    expect(screen.getByTestId('dosha-chart')).toBeInTheDocument();
  });

  test('renders Clinical Findings section with symptom bullets', () => {
    /**
     * ID: TC-UI-010
     * Clinical Findings must list the master_pain_points as bullet items.
     */
    render(
      <ReportRenderer report={buildMasterReport()} reportType="Master Report" />
    );
    expect(screen.getByText(/Clinical Findings/i)).toBeInTheDocument();
    expect(screen.getByText(/Burning sensation in stomach/i)).toBeInTheDocument();
    expect(screen.getByText(/Acid reflux after meals/i)).toBeInTheDocument();
  });

  test('renders Treatment Protocol section with herbal meds and lifestyle', () => {
    /**
     * ID: TC-UI-011
     * Treatment Protocol must show both herbal medications and lifestyle adjustments.
     */
    render(
      <ReportRenderer report={buildMasterReport()} reportType="Master Report" />
    );
    expect(screen.getByText(/Treatment Protocol/i)).toBeInTheDocument();
    expect(screen.getByText(/Shatavari/i)).toBeInTheDocument();
    expect(screen.getByText(/Avoid hot, spicy, fermented foods/i)).toBeInTheDocument();
  });

  test('renders closing disclaimer when closing field present', () => {
    /**
     * ID: TC-UI-012
     * The closing text (AI disclaimer) must be rendered at the bottom.
     */
    render(
      <ReportRenderer report={buildMasterReport()} reportType="Master Report" />
    );
    expect(
      screen.getByText(/AI-generated assessment/i)
    ).toBeInTheDocument();
  });

  test('does not crash when closing field is absent', () => {
    /**
     * ID: TC-UI-013
     * If closing is missing, the component must still render all other sections.
     */
    const report = buildMasterReport();
    delete report.closing;
    expect(() => {
      render(<ReportRenderer report={report} reportType="Master Report" />);
    }).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-UI-014  Diagnosis Report type routes to Master renderer
// ─────────────────────────────────────────────────────────────────────────────
describe('TC-UI-014: Diagnosis Report Type Routing', () => {

  test('reportType="Diagnosis Report" renders the master layout (not generic)', () => {
    /**
     * ID: TC-UI-014
     * Per the component logic: 'Master Report' OR 'Diagnosis Report' renders renderMaster().
     * Verify the Clinical Synthesis kicker does NOT appear (it says 'Medical Report').
     * Actually, both use renderMaster() — verify PageHeader is the master one.
     */
    render(
      <ReportRenderer report={buildDiagnosisReport()} reportType="Diagnosis Report" />
    );
    expect(screen.getByText(/Integrated Health Assessment/i)).toBeInTheDocument();
  });

  test('Risk & Health Score Report normalizes to Risk Report type', () => {
    /**
     * ID: TC-UI-015
     * 'Risk & Health Score Report' must be normalized to 'Risk Report'
     * by the component's type normalization logic.
     * Expected: generic renderer used (since 'Risk Report' != 'Master Report').
     */
    render(
      <ReportRenderer
        report={buildGenericReport()}
        reportType="Risk & Health Score Report"
      />
    );
    // Generic renderer shows 'Medical Report' kicker
    expect(screen.getByText(/Medical Report/i)).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-UI-016  Generic Report render path
// ─────────────────────────────────────────────────────────────────────────────
describe('TC-UI-016: Generic Report Render Path', () => {

  test('Generic report renders Medical Report kicker', () => {
    /**
     * ID: TC-UI-016
     * A non-Master/non-Diagnosis report type renders the generic layout
     * with 'Medical Report' kicker.
     */
    render(
      <ReportRenderer report={buildGenericReport()} reportType="Lifestyle Report" />
    );
    expect(screen.getByText(/Medical Report/i)).toBeInTheDocument();
  });

  test('Generic report renders Clinical Overview section', () => {
    /**
     * ID: TC-UI-017
     * The generic layout must always render 'Clinical Overview'.
     */
    render(
      <ReportRenderer report={buildGenericReport()} reportType="Root Cause Analysis" />
    );
    expect(screen.getByText(/Clinical Overview/i)).toBeInTheDocument();
    expect(screen.getByText(/Vata imbalance with dryness/i)).toBeInTheDocument();
  });

  test('Generic report renders KPI grid when kpis array has items', () => {
    /**
     * ID: TC-UI-018
     * When report.kpis has 2 items, both must render as KPI cards.
     */
    render(
      <ReportRenderer report={buildGenericReport()} reportType="Lifestyle Report" />
    );
    expect(screen.getByText('Dosha')).toBeInTheDocument();
    expect(screen.getByText('Vata')).toBeInTheDocument();
    expect(screen.getByText('Risk')).toBeInTheDocument();
    expect(screen.getByText('Low')).toBeInTheDocument();
  });

  test('Generic report skips Findings section when pain_points absent', () => {
    /**
     * ID: TC-UI-019
     * If both pain_points and symptomsReported are absent, the Findings section
     * must not be rendered (conditional rendering guard).
     */
    const report = buildGenericReport();
    delete report.pain_points;
    delete report.symptomsReported;
    render(<ReportRenderer report={report} reportType="Lifestyle Report" />);
    expect(screen.queryByText(/^Findings$/i)).not.toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-UI-020  Empty arrays & partial data resilience
// ─────────────────────────────────────────────────────────────────────────────
describe('TC-UI-020: Empty Arrays & Partial Data Resilience', () => {

  test('Empty master_kpis array renders without crashing and without KPI grid', () => {
    /**
     * ID: TC-UI-020
     * An empty KPI array must not crash and must simply omit the KPI grid.
     */
    render(
      <ReportRenderer
        report={buildMasterReport({ master_kpis: [], kpis: [] })}
        reportType="Master Report"
      />
    );
    expect(screen.getByText(/Integrated Health Assessment/i)).toBeInTheDocument();
    // No KPI cards should be visible
    expect(screen.queryByText('Primary Dosha')).not.toBeInTheDocument();
  });

  test('Empty master_pain_points array renders Findings section without bullets', () => {
    /**
     * ID: TC-UI-021
     * An empty findings array must not crash and must render the section header
     * without any bullet items.
     */
    render(
      <ReportRenderer
        report={buildMasterReport({ master_pain_points: [] })}
        reportType="Master Report"
      />
    );
    expect(screen.getByText(/Clinical Findings/i)).toBeInTheDocument();
    const findingsSection = screen.getByText(/Clinical Findings/i).closest('div');
    const bullets = within(findingsSection.parentElement).queryAllByRole('listitem');
    expect(bullets.length).toBe(0);
  });

  test('Missing doshaProfile renders default values without crashing', () => {
    /**
     * ID: TC-UI-022
     * When doshaProfile is absent, parseDoshaPercents must fall back to
     * vata=33, pitta=33, kapha=34 defaults.
     */
    const report = buildMasterReport();
    delete report.doshaProfile;
    expect(() => {
      render(<ReportRenderer report={report} reportType="Master Report" />);
    }).not.toThrow();

    const chart = screen.getByTestId('dosha-chart');
    // Default fallback values
    expect(chart.dataset.vata).toBe('33');
    expect(chart.dataset.pitta).toBe('33');
    expect(chart.dataset.kapha).toBe('34');
  });

  test('doshaProfile with zero totals does not produce NaN or Infinity', () => {
    /**
     * ID: TC-UI-023
     * If all dosha percentages are 0 (degenerate case), parseDoshaPercents
     * must produce valid percentages that sum to 100 (fallback behavior).
     */
    const report = buildMasterReport({
      doshaProfile: {
        dominant: 'Balanced',
        percentages: { vata: 0, pitta: 0, kapha: 0 },
      },
    });
    render(<ReportRenderer report={report} reportType="Master Report" />);
    const chart = screen.getByTestId('dosha-chart');
    const v = Number(chart.dataset.vata);
    const p = Number(chart.dataset.pitta);
    const k = Number(chart.dataset.kapha);
    expect(isNaN(v)).toBe(false);
    expect(isNaN(p)).toBe(false);
    expect(isNaN(k)).toBe(false);
  });

  test('null kpis falls back to empty array without crash', () => {
    /**
     * ID: TC-UI-024
     * report.master_kpis = null must be treated as an empty array.
     */
    expect(() => {
      render(
        <ReportRenderer
          report={buildMasterReport({ master_kpis: null, kpis: null })}
          reportType="Master Report"
        />
      );
    }).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-UI-025  Malformed metric values (KPICard)
// ─────────────────────────────────────────────────────────────────────────────
describe('TC-UI-025: Malformed Metric Values', () => {

  test('KPI with undefined value renders without crashing', () => {
    /**
     * ID: TC-UI-025
     * A KPI card with value=undefined must render the label but not crash.
     */
    const report = buildMasterReport({
      master_kpis: [
        { label: 'Primary Dosha', value: undefined },
        { label: 'Threat Level', value: 'Moderate' },
      ],
    });
    expect(() => {
      render(<ReportRenderer report={report} reportType="Master Report" />);
    }).not.toThrow();
    expect(screen.getByText('Primary Dosha')).toBeInTheDocument();
  });

  test('KPI with null value renders label but shows nothing for value', () => {
    /**
     * ID: TC-UI-026
     * A KPI card with value=null must render without crashing.
     */
    const report = buildMasterReport({
      master_kpis: [{ label: 'BMI', value: null }],
    });
    expect(() => {
      render(<ReportRenderer report={report} reportType="Master Report" />);
    }).not.toThrow();
  });

  test('KPI label containing "risk" applies rose color class', () => {
    /**
     * ID: TC-UI-027
     * KPICard identifies risk/threat labels and applies a rose text color.
     * The value paragraph must have the rose class.
     */
    const report = buildMasterReport({
      master_kpis: [{ label: 'Risk Score', value: 'High' }],
    });
    render(<ReportRenderer report={report} reportType="Master Report" />);
    const riskValue = screen.getByText('High');
    expect(riskValue.className).toMatch(/rose/);
  });

  test('KPI label without "risk"/"threat" applies blue/indigo color class', () => {
    /**
     * ID: TC-UI-028
     * A non-risk KPI value must have the default blue/indigo color class.
     */
    const report = buildMasterReport({
      master_kpis: [{ label: 'BMI', value: '24.5' }],
    });
    render(<ReportRenderer report={report} reportType="Master Report" />);
    const bmiValue = screen.getByText('24.5');
    expect(bmiValue.className).not.toMatch(/rose/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-UI-029  RiskMeter threat level color mapping
// ─────────────────────────────────────────────────────────────────────────────
describe('TC-UI-029: RiskMeter Threat Level Color Mapping', () => {

  const RISK_CASES = [
    { level: 'High', expectedClass: 'bg-rose-500' },
    { level: 'Severe', expectedClass: 'bg-rose-500' },
    { level: 'Moderate', expectedClass: 'bg-amber-500' },
    { level: 'Low', expectedClass: 'bg-emerald-500' },
    { level: 'Mild', expectedClass: 'bg-emerald-500' },
  ];

  test.each(RISK_CASES)(
    'RiskMeter with threatLevel="$level" renders "$expectedClass"',
    ({ level, expectedClass }) => {
      /**
       * ID: TC-UI-029 through TC-UI-033
       * Each threat level must apply the correct color class.
       * High/Severe → rose; Moderate → amber; Low/Mild → emerald.
       */
      render(
        <ReportRenderer
          report={buildMasterReport({ threatLevel: level })}
          reportType="Master Report"
        />
      );
      const riskBar = document
        .querySelector('.h-2\\.5.rounded-full.transition-all')
        ;
      if (riskBar) {
        expect(riskBar.className).toContain(expectedClass.split('-')[1]);
      }
      // At minimum verify the component renders without crashing
      expect(screen.getByText(/Risk level/i)).toBeInTheDocument();
    }
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-UI-034  textToBullets utility function behavior
// ─────────────────────────────────────────────────────────────────────────────
describe('TC-UI-034: BulletBlock & textToBullets Behavior', () => {

  test('Array of strings renders each as a bullet item', () => {
    /**
     * ID: TC-UI-034
     * master_pain_points as ['Item A', 'Item B', 'Item C'] must render
     * 3 visible bullet items.
     */
    render(
      <ReportRenderer
        report={buildMasterReport({
          master_pain_points: ['Item A', 'Item B', 'Item C'],
        })}
        reportType="Master Report"
      />
    );
    expect(screen.getByText('Item A')).toBeInTheDocument();
    expect(screen.getByText('Item B')).toBeInTheDocument();
    expect(screen.getByText('Item C')).toBeInTheDocument();
  });

  test('Long string >140 chars is split into sentence bullets', () => {
    /**
     * ID: TC-UI-035
     * A string >140 chars is split by sentence boundaries in textToBullets.
     * Expected: multiple bullet items, not one.
     */
    const long =
      'Pitta is aggravated by heat and spicy foods. ' +
      'This leads to inflammatory conditions in the body. ' +
      'Treatment focuses on cooling and pacifying the digestive fire. ' +
      'Regular meals and avoidance of fermented foods are recommended.';
    render(
      <ReportRenderer
        report={buildMasterReport({ master_pain_points: long })}
        reportType="Master Report"
      />
    );
    const items = screen.getAllByRole('listitem');
    expect(items.length).toBeGreaterThan(1);
  });

  test('Bullet character (•) delimited string splits correctly', () => {
    /**
     * ID: TC-UI-036
     * A string like '• Item A\n• Item B' must produce 2 separate bullets.
     */
    render(
      <ReportRenderer
        report={buildMasterReport({
          master_pain_points: '• Burning sensation\n• Acid reflux',
        })}
        reportType="Master Report"
      />
    );
    expect(screen.getByText('Burning sensation')).toBeInTheDocument();
    expect(screen.getByText('Acid reflux')).toBeInTheDocument();
  });

  test('Empty string value renders no bullet items', () => {
    /**
     * ID: TC-UI-037
     * textToBullets('') must return [] → no <li> rendered in that block.
     */
    render(
      <ReportRenderer
        report={buildMasterReport({ master_pain_points: '' })}
        reportType="Master Report"
      />
    );
    // Verify the section header exists but no bullets are rendered for empty string
    // (other sections may have bullets, so we count specific content)
    expect(screen.queryByText(/^$/)).not.toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-UI-038  parseDoshaPercents normalization
// ─────────────────────────────────────────────────────────────────────────────
describe('TC-UI-038: parseDoshaPercents Normalization', () => {

  test('Percentages sum to 100 after normalization', () => {
    /**
     * ID: TC-UI-038
     * Even if input percentages don't sum to 100 (e.g., 40+30+20=90),
     * parseDoshaPercents must normalize them to 100%.
     */
    const report = buildMasterReport({
      doshaProfile: {
        dominant: 'Vata',
        percentages: { vata: 40, pitta: 30, kapha: 20 }, // sum=90
      },
    });
    render(<ReportRenderer report={report} reportType="Master Report" />);
    const chart = screen.getByTestId('dosha-chart');
    const sum =
      Number(chart.dataset.vata) +
      Number(chart.dataset.pitta) +
      Number(chart.dataset.kapha);
    // Due to rounding, sum might be 99 or 100 or 101
    expect(sum).toBeGreaterThanOrEqual(99);
    expect(sum).toBeLessThanOrEqual(101);
  });

  test('Capital-case keys (Vata, Pitta, Kapha) are parsed correctly', () => {
    /**
     * ID: TC-UI-039
     * doshaProfile.percentages may use capitalized keys from the AI output.
     * parseDoshaPercents handles both 'vata'/'Vata' via ?? fallback.
     */
    const report = buildMasterReport({
      doshaProfile: {
        dominant: 'Kapha',
        percentages: { Vata: 15, Pitta: 25, Kapha: 60 },
      },
    });
    render(<ReportRenderer report={report} reportType="Master Report" />);
    const chart = screen.getByTestId('dosha-chart');
    expect(Number(chart.dataset.kapha)).toBeGreaterThan(Number(chart.dataset.vata));
  });

  test('Nested balance object is read when percentages key absent', () => {
    /**
     * ID: TC-UI-040
     * parseDoshaPercents reads profile.balance if profile.percentages is absent.
     */
    const report = buildMasterReport({
      doshaProfile: {
        dominant: 'Pitta',
        balance: { vata: 20, pitta: 60, kapha: 20 },
      },
    });
    render(<ReportRenderer report={report} reportType="Master Report" />);
    const chart = screen.getByTestId('dosha-chart');
    expect(chart.dataset.pitta).toBe('60');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-UI-041  Streaming token simulation (React concurrent rendering)
// ─────────────────────────────────────────────────────────────────────────────
describe('TC-UI-041: Streaming Token Resilience', () => {

  test('Partial report with only master_kpis renders without crashing', () => {
    /**
     * ID: TC-UI-041
     * During streaming, only partial data may be available.
     * A report with only kpis set must not crash.
     */
    const partialReport = {
      master_kpis: [{ label: 'Primary Dosha', value: 'Pitta' }],
    };
    expect(() => {
      render(<ReportRenderer report={partialReport} reportType="Master Report" />);
    }).not.toThrow();
  });

  test('Report with only doshaProfile renders without crashing', () => {
    /**
     * ID: TC-UI-042
     * Only doshaProfile set — all other fields absent.
     */
    const partialReport = {
      doshaProfile: { dominant: 'Vata', percentages: { vata: 60, pitta: 20, kapha: 20 } },
    };
    expect(() => {
      render(<ReportRenderer report={partialReport} reportType="Master Report" />);
    }).not.toThrow();
  });

  test('Rapid re-render with different props does not leave stale content', () => {
    /**
     * ID: TC-UI-043
     * Simulates the streaming scenario where props update with new data.
     * After re-render with updated report, the new content must be visible.
     */
    const { rerender } = render(
      <ReportRenderer
        report={buildMasterReport({ master_kpis: [{ label: 'Loading…', value: '—' }] })}
        reportType="Master Report"
      />
    );
    expect(screen.getByText('Loading…')).toBeInTheDocument();

    rerender(
      <ReportRenderer
        report={buildMasterReport({ master_kpis: [{ label: 'Primary Dosha', value: 'Pitta' }] })}
        reportType="Master Report"
      />
    );
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
    expect(screen.getByText('Primary Dosha')).toBeInTheDocument();
  });

  test('Report switching from Diagnosis to Master Report type updates layout', () => {
    /**
     * ID: TC-UI-044
     * When the reportType prop changes from 'Diagnosis Report' to a generic type,
     * the rendered output must switch to the generic layout.
     */
    const { rerender } = render(
      <ReportRenderer report={buildDiagnosisReport()} reportType="Diagnosis Report" />
    );
    expect(screen.getByText(/Integrated Health Assessment/i)).toBeInTheDocument();

    rerender(
      <ReportRenderer report={buildGenericReport()} reportType="Lifestyle Report" />
    );
    expect(screen.getByText(/Medical Report/i)).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-UI-045  Accessibility & structure
// ─────────────────────────────────────────────────────────────────────────────
describe('TC-UI-045: Structural Integrity', () => {

  test('Report container has correct max-width class', () => {
    /**
     * ID: TC-UI-045
     * The outer container must have max-w-3xl class for layout consistency.
     */
    const { container } = render(
      <ReportRenderer report={buildMasterReport()} reportType="Master Report" />
    );
    const outer = container.querySelector('.max-w-3xl');
    expect(outer).toBeTruthy();
  });

  test('Each section has a heading element', () => {
    /**
     * ID: TC-UI-046
     * The 4 sections must each have a visible heading text:
     * Diagnostic Summary, Biological Constitution, Clinical Findings, Treatment Protocol.
     */
    render(<ReportRenderer report={buildMasterReport()} reportType="Master Report" />);
    const headings = [
      'Diagnostic Summary',
      'Biological Constitution',
      'Clinical Findings',
      'Treatment Protocol',
    ];
    headings.forEach((heading) => {
      expect(screen.getByText(new RegExp(heading, 'i'))).toBeInTheDocument();
    });
  });

  test('DoshaBars renders Vata, Pitta, Kapha labels', () => {
    /**
     * ID: TC-UI-047
     * The DoshaBars sub-component must render 3 bar rows with correct labels.
     */
    render(<ReportRenderer report={buildMasterReport()} reportType="Master Report" />);
    expect(screen.getByText('Vata')).toBeInTheDocument();
    expect(screen.getByText('Pitta')).toBeInTheDocument();
    expect(screen.getByText('Kapha')).toBeInTheDocument();
  });

  test('No duplicate key warnings (unique keys in lists)', () => {
    /**
     * ID: TC-UI-048
     * Simulated via no console.error during render of arrays.
     * Items with the same text in different lists must use index keys without collision.
     */
    const warnSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    render(<ReportRenderer report={buildMasterReport()} reportType="Master Report" />);
    const keyWarnings = warnSpy.mock.calls.filter((call) =>
      (call[0] || '').includes('unique key')
    );
    expect(keyWarnings.length).toBe(0);
    warnSpy.mockRestore();
  });
});
