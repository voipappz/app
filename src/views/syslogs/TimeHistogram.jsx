import React, { useRef, useEffect, useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import * as d3 from 'd3';

/**
 * Chronograf-style Time Histogram
 * Shows log volume over time as vertical bars
 */
const TimeHistogram = ({
  logs,
  height = 120,
  timeInterval = 'minute',
  aggregateData = null,  // Pre-aggregated server data: [{ time: Date, total: N, severities: {...} }]
  onBrushSelection = null, // (startDate, endDate) — drag across the chart to filter the screen to that window
  onBarClick = null, // (seriesKey, bucket) — apply the clicked series as a screen filter
  // Optional legend under the chart: each series' colour, its name
  // (labelFor(key) -> text, default the key) and its total over the range.
  showLegend = false,
  labelFor = null,
  onLegendClick = null, // (seriesKey) — same as clicking that series' bar
}) => {
  const containerRef = useRef();
  const svgRef = useRef();

  // Colors for stacking — covers both severity levels and event types
  const SEVERITY_COLORS = {
    // Severity levels
    emerg: '#991b1b',
    emergency: '#991b1b',
    alert: '#b91c1c',
    crit: '#dc2626',
    critical: '#dc2626',
    error: '#ea580c',
    err: '#ea580c',
    warning: '#eab308',
    warn: '#eab308',
    notice: '#3b82f6',
    info: '#06b6d4',
    debug: '#22c55e',
    trace: '#a855f7',
    // Event types (for Logs screen group-by-type mode)
    EventCall: '#3b82f6',
    EventLog: '#06b6d4',
    EventAudit: '#8b5cf6',
    EventStatus: '#10b981',
    EventUser: '#f59e0b',
    EventError: '#ef4444',
    EventQueue: '#ec4899',
    EventStat: '#14b8a6',
    EventCdr: '#6366f1',
    EventReport: '#84cc16',
    EventEndpoint: '#f97316',
    // Call causes/directions (Calls screen CounterTimeline)
    answer: '#10b981',
    no_answer: '#f59e0b',
    busy: '#ef4444',
    cancel: '#6b7280',
    failed: '#ef4444',
    amd: '#8b5cf6',
    incoming: '#06b6d4',
    outgoing: '#8b5cf6',
    // A series with no value is "unknown", never a colour that reads as data.
    none: '#9ca3af',
    unknown: '#cbd5e1',
  };

  // Process logs into time buckets (or use pre-aggregated data)
  const chartData = useMemo(() => {
    // If pre-aggregated data is provided, use it directly
    if (aggregateData && aggregateData.length > 0) {
      return aggregateData;
    }

    if (!logs || logs.length === 0) return [];

    // Bucket and render in UTC (GMT) throughout.
    //
    // The API returns naive timestamps ("2026-07-16T10:00:00", no offset), which
    // JS parses as LOCAL time — so a 10:00 UTC bucket was drawn and labelled
    // 10:00 while the rows beside it showed 13:00 local. The axis wasn't wrong
    // by an hour, it was silently mixing two clocks. Everything here is now
    // explicitly UTC (d3.utc* rather than d3.time*), and the axis says GMT.
    const getBucket = (timestamp) => {
      const date = new Date(timestamp);
      switch (timeInterval) {
        case 'minute':
          return d3.utcMinute.floor(date);
        case 'hour':
          return d3.utcHour.floor(date);
        case 'day':
          return d3.utcDay.floor(date);
        default:
          return d3.utcMinute.floor(date);
      }
    };

    // Parse timestamp from log
    const parseTime = (log) => {
      if (log.time) {
        const ts = parseInt(log.time);
        return isNaN(ts) ? new Date(log.time) : new Date(ts * 1000);
      }
      if (log.timestamp) {
        const ts = parseInt(log.timestamp);
        return isNaN(ts) ? new Date(log.timestamp) : new Date(ts * 1000);
      }
      if (log.isodate) {
        return new Date(log.isodate);
      }
      return new Date();
    };

    // Group by time bucket and severity
    const buckets = new Map();

    logs.forEach(log => {
      const time = parseTime(log);
      const bucket = getBucket(time);
      const bucketKey = bucket.getTime();
      const severity = (log.severity || 'info').toLowerCase();

      if (!buckets.has(bucketKey)) {
        buckets.set(bucketKey, { time: bucket, total: 0, severities: {} });
      }

      const bucketData = buckets.get(bucketKey);
      bucketData.total++;
      bucketData.severities[severity] = (bucketData.severities[severity] || 0) + 1;
    });

    // Convert to array and sort
    return Array.from(buckets.values()).sort((a, b) => a.time - b.time);
  }, [logs, timeInterval, aggregateData]);

  // Get all unique severities
  const severities = useMemo(() => {
    const allSeverities = new Set();
    chartData.forEach(d => {
      Object.keys(d.severities).forEach(s => allSeverities.add(s));
    });
    // Sort by severity level
    const severityOrder = ['emerg', 'emergency', 'alert', 'crit', 'critical', 'error', 'err', 'warning', 'warn', 'notice', 'info', 'debug', 'trace'];
    return Array.from(allSeverities).sort((a, b) => {
      const aIdx = severityOrder.indexOf(a);
      const bIdx = severityOrder.indexOf(b);
      return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
    });
  }, [chartData]);

  useEffect(() => {
    if (!chartData || chartData.length === 0 || !containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth || 800;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const margin = { top: 10, right: 20, bottom: 30, left: 50 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    svg
      .attr("width", width)
      .attr("height", height)
      .style("background", "var(--mui-palette-background-paper)");

    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // X Scale - time
    const xExtent = d3.extent(chartData, d => d.time);
    const xScale = d3.scaleUtc()
      .domain(xExtent)
      .range([0, chartWidth]);

    // Y Scale - count
    const maxCount = d3.max(chartData, d => d.total) || 1;
    const yScale = d3.scaleLinear()
      .domain([0, maxCount])
      .range([chartHeight, 0]);

    // Calculate bar width based on data density
    const barWidth = Math.max(2, Math.min(20, chartWidth / chartData.length - 1));

    // Create stacked data
    const stack = d3.stack()
      .keys(severities)
      .value((d, key) => d.severities[key] || 0);

    const stackedData = stack(chartData);

    // Draw stacked bars
    g.selectAll("g.layer")
      .data(stackedData)
      .enter()
      .append("g")
      .attr("class", "layer")
      .attr("fill", d => SEVERITY_COLORS[d.key] || '#6b7280')
      .selectAll("rect")
      .data(d => d)
      .enter()
      .append("rect")
      .attr("x", d => xScale(d.data.time) - barWidth / 2)
      .attr("y", d => yScale(d[1]))
      .attr("height", d => yScale(d[0]) - yScale(d[1]))
      .attr("width", barWidth)
      .attr("rx", 1)
      .style("cursor", onBarClick ? "pointer" : "default")
      .on("mouseover", function(event, d) {
        d3.select(this).attr("opacity", 0.8);

        // Tooltip
        const tooltip = d3.select("body").append("div")
          .attr("class", "histogram-tooltip")
          .style("position", "absolute")
          .style("background", "rgba(0,0,0,0.85)")
          .style("color", "white")
          .style("padding", "8px 12px")
          .style("border-radius", "4px")
          .style("font-size", "12px")
          .style("pointer-events", "none")
          .style("z-index", "10000")
          .style("box-shadow", "0 2px 8px rgba(0,0,0,0.3)");

        const timeFormat = timeInterval === 'day'
          ? d3.utcFormat("%Y-%m-%d")
          : d3.utcFormat("%H:%M");

        let html = `<strong>${timeFormat(d.data.time)} GMT</strong><br/>`;
        html += `Total: ${d.data.total} logs<br/>`;
        Object.entries(d.data.severities)
          .sort((a, b) => b[1] - a[1])
          .forEach(([sev, count]) => {
            html += `<span style="color:${SEVERITY_COLORS[sev] || '#999'}">${sev}: ${count}</span><br/>`;
          });

        tooltip
          .html(html)
          .style("left", (event.pageX + 10) + "px")
          .style("top", (event.pageY - 10) + "px");
      })
      .on("mouseout", function() {
        d3.select(this).attr("opacity", 1);
        d3.selectAll(".histogram-tooltip").remove();
      })
      .on("click", function(event, d) {
        if (!onBarClick) return;
        event.stopPropagation();
        const seriesKey = d3.select(this.parentNode).datum()?.key;
        if (seriesKey != null) onBarClick(String(seriesKey), d.data);
      });

    // X Axis
    const xAxis = d3.axisBottom(xScale)
      .ticks(Math.min(chartData.length, 10))
      .tickFormat(timeInterval === 'day' ? d3.utcFormat("%m/%d") : d3.utcFormat("%H:%M"));

    g.append("g")
      .attr("transform", `translate(0,${chartHeight})`)
      .call(xAxis)
      .selectAll("text")
      .style("font-size", "10px")
      .style("fill", "var(--mui-palette-text-secondary)");

    // Name the clock. The rows below this chart render in local time, so an
    // unlabelled axis reads as local and quietly disagrees with them.
    g.append("text")
      .attr("x", chartWidth)
      .attr("y", chartHeight + 26)
      .attr("text-anchor", "end")
      .style("font-size", "9px")
      .style("fill", "var(--mui-palette-text-disabled)")
      .text("GMT");

    // Y Axis
    // Counts are whole numbers: only integer ticks, at most 4 (a max of 1
    // drew "1 1 1 0 0 0" - fractional ticks rounded by the "d" format).
    const yMax = yScale.domain()[1];
    const yTicks = yScale.ticks(Math.min(4, Math.max(1, Math.floor(yMax)))).filter(Number.isInteger);
    const yAxis = d3.axisLeft(yScale)
      .tickValues(yTicks)
      .tickFormat(d3.format("d"));

    g.append("g")
      .call(yAxis)
      .selectAll("text")
      .style("font-size", "10px")
      .style("fill", "var(--mui-palette-text-secondary)");

    // Grid lines
    g.append("g")
      .attr("class", "grid")
      .selectAll("line")
      .data(yTicks)
      .enter()
      .append("line")
      .attr("x1", 0)
      .attr("x2", chartWidth)
      .attr("y1", d => yScale(d))
      .attr("y2", d => yScale(d))
      .attr("stroke", "#e5e7eb")
      .attr("stroke-dasharray", "2,2");

    // Brush-to-filter: drag across a spike to zoom the screen into that window.
    // Rendered UNDER the bars (insert, not append) so bar tooltips keep working;
    // the brush overlay still captures drags on empty space and through bars.
    if (onBrushSelection) {
      const brush = d3.brushX()
        .extent([[0, 0], [chartWidth, chartHeight]])
        .on('end', (event) => {
          if (!event.selection || !event.sourceEvent) return; // ignore programmatic/empty
          const [x0, x1] = event.selection;
          if (Math.abs(x1 - x0) < 4) return; // accidental click, not a drag
          onBrushSelection(xScale.invert(x0), xScale.invert(x1));
          // clear the brush rectangle after applying
          g.select('.histogram-brush').call(brush.move, null);
        });
      g.insert('g', ':first-child')
        .attr('class', 'histogram-brush')
        .call(brush);
      svg.style('cursor', 'crosshair');
    }

  }, [chartData, severities, height, timeInterval, onBrushSelection, onBarClick]);

  if ((!logs || logs.length === 0) && (!aggregateData || aggregateData.length === 0)) {
    return (
      <Box sx={{
        height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'var(--mui-palette-background-paper)',
        border: '1px solid var(--mui-palette-divider)',
        borderRadius: 1
      }}>
        <Typography variant="body2" color="text.secondary">
          No log data for histogram
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      ref={containerRef}
      sx={{
        width: '100%',
        bgcolor: 'var(--mui-palette-background-paper)',
        border: '1px solid var(--mui-palette-divider)',
        borderRadius: 1,
        overflow: 'hidden'
      }}
    >
      <svg ref={svgRef} style={{ display: 'block', width: '100%' }} />
      {showLegend && severities.length > 0 && (
        <Box
          data-testid="histogram-legend"
          sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, px: 1.5, py: 0.75, borderTop: '1px solid var(--mui-palette-divider)' }}
        >
          {severities.map((key) => {
            const total = chartData.reduce((sum, d) => sum + (Number(d.severities?.[key]) || 0), 0);
            const label = labelFor ? labelFor(key) : key;
            const clickable = typeof onLegendClick === 'function';
            return (
              <Box
                key={key}
                component={clickable ? 'button' : 'span'}
                type={clickable ? 'button' : undefined}
                onClick={clickable ? () => onLegendClick(key) : undefined}
                sx={{
                  display: 'inline-flex', alignItems: 'center', gap: 0.75, p: 0, border: 0, bgcolor: 'transparent',
                  cursor: clickable ? 'pointer' : 'default', font: 'inherit', color: 'var(--mui-palette-text-primary)',
                }}
              >
                <Box component="span" sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: SEVERITY_COLORS[key] || '#999' }} />
                <Typography component="span" sx={{ fontSize: '0.85rem' }}>{label}</Typography>
                <Typography component="span" sx={{ fontSize: '0.85rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{total}</Typography>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
};

export default TimeHistogram;
