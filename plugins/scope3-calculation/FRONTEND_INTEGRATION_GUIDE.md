# Frontend Integration Guide - Calculation Module

## Quick Start

### Demo Job IDs (Ready to Use)
```javascript
const DEMO_JOBS = {
  Q1_2024: '7f1aabe1-28ea-45e9-9b06-61d9f6585db1',
  Q2_2024: 'd088b3a1-865e-4475-94a2-baf0a8099c3a',
  Q3_2024: '494d7d66-5dcc-49c8-86a6-03f8effa25f6'
};
```

## API Endpoints

### 1. Dashboard - Load Emissions Summary
```javascript
// Compute emissions for a job
const response = await fetch('/api/calc/compute', {
  method: 'POST',
  body: JSON.stringify({
    job_id: DEMO_JOBS.Q1_2024,
    refresh: false  // Use cached if available
  })
});

/* Response:
{
  "run_id": "uuid",
  "total_emissions_tco2e": 156.78,
  "total_spend_reporting": 1634500.50,
  "methodology_counts": {
    "spend": 34,
    "average_quantity": 8,
    "none": 0
  },
  "inventory_item_count": 42
}
*/
```

**Dashboard Components:**
- Total emissions: `response.total_emissions_tco2e`
- Emission intensity: `(total_emissions_tco2e / total_spend_reporting) * 1000` kgCO2e/USD
- Methodology pie chart: `methodology_counts`

### 2. Hotspots - Reduction Opportunities
```javascript
// Get top reduction campaigns
const hotspots = await fetch('/api/calc/hotspot_campaigns', {
  method: 'POST',
  body: JSON.stringify({
    job_id: DEMO_JOBS.Q1_2024,
    top_n: 10
  })
});

/* Response:
{
  "campaigns": [
    {
      "rank": 1,
      "vendor": "Pacific Logistics Co",
      "category_name": "General Freight Trucking",
      "emissions_tco2e": 45.23,
      "emission_share_pct": 28.8,
      "recommendations": [
        "Switch to low-carbon transport modes",
        "Optimize logistics routes",
        ...
      ],
      "reduction_potential_pct": 25,
      "potential_reduction_tco2e": 11.31,
      "priority": "High",
      "timeline": "6-12 months"
    }
  ],
  "total_potential_reduction_tco2e": 35.67,
  "total_reduction_potential_pct": 22.7
}
*/
```

**Hotspots Page Components:**
- Campaign cards: Loop through `campaigns` array
- Priority badge: Color by `priority` (High=red, Medium=yellow, Low=green)
- Reduction chart: Show `potential_reduction_tco2e` bars
- Total savings: Display `total_potential_reduction_tco2e`

### 3. Reports - Export Options
```javascript
// Export PDF report
const pdf = await fetch('/api/calc/export', {
  method: 'POST',
  body: JSON.stringify({
    job_id: DEMO_JOBS.Q1_2024,
    format: 'pdf'  // or 'csv', 'json'
  })
});

/* PDF Response:
{
  "pdf_manifest": {
    "pages": [/* 3 pages */],
    "filename": "Q1-2024-spend-data.csv",
    "generated_at": "2024-03-31T12:00:00Z"
  },
  "page_count": 3,
  "file_size_kb": 45
}
*/

// CSV Response:
{
  "format": "csv",
  "content": "vendor,item_description,category,...",
  "item_count": 42
}
```

**Reports Page:**
- Export buttons: PDF, CSV, JSON
- Preview: Render PDF manifest pages or show CSV table
- Download: Convert content to Blob and trigger download

### 4. Admin - Factor Management & Replay
```javascript
// Update an emission factor
await fetch('/api/calc/db/set', {
  method: 'POST',
  body: JSON.stringify({
    collection: 'emission_factors',
    doc: {
      _id: 'ef_331110_spend_usd',
      emission_factor: 0.500  // Updated value
    }
  })
});

// Recompute all emissions with new factors
const replay = await fetch('/api/calc/replay', {
  method: 'POST',
  body: JSON.stringify({
    job_id: DEMO_JOBS.Q1_2024
  })
});

/* Response:
{
  "replayed": true,
  "total_emissions_tco2e": 162.45,  // Updated
  "message": "Emissions recomputed with current emission factors"
}
*/
```

**Admin Workflow:**
1. List factors: `calc.db.get` with `collection: 'emission_factors'`
2. Edit factor: Update UI form
3. Save factor: `calc.db.set`
4. Replay: `calc.replay` for affected jobs
5. Show diff: Compare before/after emissions

## Component Examples

### Dashboard Summary Card
```tsx
function EmissionsSummary({ jobId }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch('/api/calc/compute', {
      method: 'POST',
      body: JSON.stringify({ job_id: jobId })
    })
      .then(r => r.json())
      .then(setData);
  }, [jobId]);

  if (!data) return <Spinner />;

  return (
    <Card>
      <h2>Total Emissions</h2>
      <div className="stat">
        {data.total_emissions_tco2e.toFixed(2)} tCO2e
      </div>
      <MethodologyChart data={data.methodology_counts} />
    </Card>
  );
}
```

### Hotspots List
```tsx
function HotspotsList({ jobId }) {
  const [campaigns, setCampaigns] = useState([]);

  useEffect(() => {
    fetch('/api/calc/hotspot_campaigns', {
      method: 'POST',
      body: JSON.stringify({ job_id: jobId, top_n: 10 })
    })
      .then(r => r.json())
      .then(data => setCampaigns(data.campaigns));
  }, [jobId]);

  return (
    <div className="hotspots">
      {campaigns.map(campaign => (
        <CampaignCard key={campaign.rank} campaign={campaign} />
      ))}
    </div>
  );
}

function CampaignCard({ campaign }) {
  const priorityColor = {
    High: 'red',
    Medium: 'yellow',
    Low: 'green'
  }[campaign.priority];

  return (
    <Card>
      <Badge color={priorityColor}>{campaign.priority}</Badge>
      <h3>#{campaign.rank} {campaign.vendor}</h3>
      <p>{campaign.category_name}</p>
      <div className="emissions">
        {campaign.emissions_tco2e.toFixed(2)} tCO2e
        <span className="share">({campaign.emission_share_pct}%)</span>
      </div>
      <div className="reduction">
        Potential: {campaign.potential_reduction_tco2e} tCO2e
        <span className="percent">(-{campaign.reduction_potential_pct}%)</span>
      </div>
      <ul className="recommendations">
        {campaign.recommendations.map((rec, i) => (
          <li key={i}>{rec}</li>
        ))}
      </ul>
      <div className="timeline">
        Timeline: {campaign.timeline} | Effort: {campaign.estimated_effort}
      </div>
    </Card>
  );
}
```

### Export Buttons
```tsx
function ExportButtons({ jobId }) {
  const handleExport = async (format) => {
    const response = await fetch('/api/calc/export', {
      method: 'POST',
      body: JSON.stringify({ job_id: jobId, format })
    });
    const data = await response.json();

    if (format === 'csv') {
      downloadFile(data.content, `emissions-${jobId}.csv`, 'text/csv');
    } else if (format === 'json') {
      downloadFile(data.content, `emissions-${jobId}.json`, 'application/json');
    } else if (format === 'pdf') {
      // Option 1: Download manifest
      downloadFile(
        JSON.stringify(data.pdf_manifest, null, 2),
        `emissions-${jobId}-manifest.json`,
        'application/json'
      );
      // Option 2: Send to backend for PDF rendering
      // const pdfBlob = await renderPdf(data.pdf_manifest);
      // downloadFile(pdfBlob, `emissions-${jobId}.pdf`, 'application/pdf');
    }
  };

  return (
    <div>
      <Button onClick={() => handleExport('csv')}>Export CSV</Button>
      <Button onClick={() => handleExport('json')}>Export JSON</Button>
      <Button onClick={() => handleExport('pdf')}>Export PDF</Button>
    </div>
  );
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

## Data Flow

```
1. User selects Q1 2024 job
   └─> Frontend loads jobId: 7f1aabe1-28ea-45e9-9b06-61d9f6585db1

2. Dashboard loads
   └─> calc.compute → total_emissions_tco2e
   └─> calc.dqs_score → data quality badge
   └─> Renders summary cards

3. User clicks "View Hotspots"
   └─> calc.hotspot_campaigns → campaigns array
   └─> Renders reduction opportunities
   └─> Shows potential savings

4. User clicks "Export PDF"
   └─> calc.export format=pdf → pdf_manifest
   └─> Renders 3-page report preview
   └─> Download button saves file

5. Admin updates emission factor
   └─> calc.db.set → updates factor
   └─> calc.replay → recomputes emissions
   └─> Shows before/after comparison
```

## Error Handling

```javascript
async function safeApiCall(endpoint, body) {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(data.message || 'API error');
    }

    return data;
  } catch (error) {
    console.error('API call failed:', error);
    toast.error(error.message);
    return null;
  }
}

// Usage
const emissions = await safeApiCall('/api/calc/compute', {
  job_id: DEMO_JOBS.Q1_2024
});

if (emissions) {
  updateDashboard(emissions);
}
```

## Performance Tips

1. **Cache compute results**: Use `refresh: false` by default
2. **Paginate hotspots**: Start with `top_n: 5`, load more on demand
3. **Lazy load exports**: Only fetch when user clicks export button
4. **Debounce replay**: Don't trigger on every factor update
5. **Use loading states**: Show spinners during API calls

## Testing Checklist

- [ ] Dashboard loads Q1/Q2/Q3 emissions
- [ ] Methodology chart shows spend/quantity/none breakdown
- [ ] Hotspots page displays top 10 campaigns
- [ ] Reduction recommendations render correctly
- [ ] CSV export downloads with correct data
- [ ] JSON export has valid format
- [ ] PDF export generates 3-page manifest
- [ ] Replay updates emissions after factor change
- [ ] Error messages display for invalid job IDs
- [ ] Loading states show during API calls

## Support

For issues or questions:
- Check `/plugins/scope3-calculation/CALC_MODULE_UPDATES.md` for API details
- Run `node test-integration.js` to verify data integrity
- Test MCP tools with job IDs: 7f1aabe1... (Q1), d088b3a1... (Q2), 494d7d66... (Q3)
