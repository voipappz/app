import React, { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';

const WIDTH = 720;
const HEIGHT = 320;

const finite = (value) => Number.isFinite(Number(value));
const project = ([longitude, latitude]) => [
  ((Math.max(-180, Math.min(180, Number(longitude))) + 180) / 360) * WIDTH,
  ((90 - Math.max(-90, Math.min(90, Number(latitude)))) / 180) * HEIGHT,
];

const parseGeoJson = (value) => {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return null; }
};

const collectGeometry = (geometry, label, output) => {
  if (!geometry) return;
  const coordinates = geometry.coordinates;
  switch (geometry.type) {
    case 'Point':
      if (coordinates?.length >= 2) output.points.push({ coordinates, label });
      break;
    case 'MultiPoint':
      (coordinates || []).forEach((point) => output.points.push({ coordinates: point, label }));
      break;
    case 'LineString':
      output.paths.push({ coordinates: coordinates || [], label, closed: false });
      break;
    case 'MultiLineString':
      (coordinates || []).forEach((line) => output.paths.push({ coordinates: line, label, closed: false }));
      break;
    case 'Polygon':
      (coordinates || []).forEach((ring) => output.paths.push({ coordinates: ring, label, closed: true }));
      break;
    case 'MultiPolygon':
      (coordinates || []).forEach((polygon) => polygon.forEach((ring) => (
        output.paths.push({ coordinates: ring, label, closed: true })
      )));
      break;
    case 'GeometryCollection':
      (geometry.geometries || []).forEach((item) => collectGeometry(item, label, output));
      break;
    default:
      break;
  }
};

const collectGeoJson = (value, output, inheritedLabel = '') => {
  const geo = parseGeoJson(value);
  if (!geo) return;
  if (geo.type === 'FeatureCollection') {
    (geo.features || []).forEach((feature) => collectGeoJson(feature, output, inheritedLabel));
  } else if (geo.type === 'Feature') {
    const props = geo.properties || {};
    const label = props.name || props.title || props.label || inheritedLabel;
    collectGeometry(geo.geometry, label, output);
  } else {
    collectGeometry(geo, inheritedLabel, output);
  }
};

export const extractMapShapes = (columns = [], rows = []) => {
  const byName = Object.fromEntries(columns.map((column) => [String(column).toLowerCase(), column]));
  const latitudeKey = byName.latitude || byName.lat;
  const longitudeKey = byName.longitude || byName.lon || byName.lng;
  const geoJsonKey = byName.geojson;
  const labelKey = columns.find((column) => ![
    latitudeKey, longitudeKey, geoJsonKey,
  ].includes(column));
  const output = { points: [], paths: [] };

  rows.forEach((row) => {
    const label = labelKey ? String(row[labelKey] ?? '') : '';
    if (latitudeKey && longitudeKey && finite(row[latitudeKey]) && finite(row[longitudeKey])) {
      output.points.push({ coordinates: [Number(row[longitudeKey]), Number(row[latitudeKey])], label });
    }
    if (geoJsonKey) collectGeoJson(row[geoJsonKey], output, label);
  });

  return output;
};

const pathData = (coordinates, closed) => {
  const valid = (coordinates || []).filter((pair) => pair?.length >= 2 && finite(pair[0]) && finite(pair[1]));
  if (!valid.length) return '';
  const parts = valid.map((pair, index) => {
    const [x, y] = project(pair);
    return `${index ? 'L' : 'M'} ${x.toFixed(2)} ${y.toFixed(2)}`;
  });
  return `${parts.join(' ')}${closed ? ' Z' : ''}`;
};

/** Lightweight, token-free geographic result renderer for Blazer's lat/lng
 * and GeoJSON conventions. It intentionally uses an equirectangular world
 * projection so reports work without a Mapbox account or another data source. */
const ReportMap = ({ columns, rows, height = 320 }) => {
  const { t } = useTranslation('reports');
  const shapes = useMemo(() => extractMapShapes(columns, rows), [columns, rows]);
  if (!shapes.points.length && !shapes.paths.length) {
    return <Typography variant="body2" color="text.secondary">{t('map.noData')}</Typography>;
  }

  return (
    <Box role="img" aria-label={t('map.label')} sx={{ width: '100%', height, minHeight: 220 }}>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
        <rect width={WIDTH} height={HEIGHT} rx="8" fill="#f4f8fb" stroke="#cbd5e1" />
        {[-120, -60, 0, 60, 120].map((longitude) => {
          const [x] = project([longitude, 0]);
          return <line key={`lon-${longitude}`} x1={x} x2={x} y1="0" y2={HEIGHT} stroke="#dbe5ec" strokeWidth="1" />;
        })}
        {[-60, -30, 0, 30, 60].map((latitude) => {
          const [, y] = project([0, latitude]);
          return <line key={`lat-${latitude}`} x1="0" x2={WIDTH} y1={y} y2={y} stroke="#dbe5ec" strokeWidth="1" />;
        })}
        {shapes.paths.map((shape, index) => (
          <path key={`path-${index}`} d={pathData(shape.coordinates, shape.closed)}
            fill={shape.closed ? 'rgba(16, 185, 129, 0.16)' : 'none'}
            stroke="#0e9488" strokeWidth="2">
            {shape.label && <title>{shape.label}</title>}
          </path>
        ))}
        {shapes.points.map((point, index) => {
          const [x, y] = project(point.coordinates);
          return (
            <circle key={`point-${index}`} cx={x} cy={y} r="5" fill="#8b5cf6" stroke="#fff" strokeWidth="2">
              <title>{point.label || `${point.coordinates[1]}, ${point.coordinates[0]}`}</title>
            </circle>
          );
        })}
      </svg>
    </Box>
  );
};

export default ReportMap;
