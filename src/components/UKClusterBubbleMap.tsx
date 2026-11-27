import React, { memo, useMemo, useRef, useState } from 'react';
import { geoAlbers, geoGraticule10, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { FeatureCollection, Geometry } from 'geojson';
import worldAtlas from 'world-atlas/countries-50m.json';
import { Maximize2, Minus, Plus, RotateCcw, X } from 'lucide-react';
import { UKCluster } from '../types/lifeScience';

export type BubbleMetricMode = 'vacancies' | 'labSpace' | 'medianSalary';

export interface ClusterAggregate {
  cluster: UKCluster;
  vacancyCount: number;
  medianSalaryGbp: number;
  meanDaysOpen: number;
  juniorSharePct: number;
  featuredCount: number;
}

interface UKClusterBubbleMapProps {
  aggregates: ClusterAggregate[];
  selectedClusterId: string | null;
  onSelectCluster: (clusterId: string | null) => void;
  metricMode: BubbleMetricMode;
  onMetricModeChange: (mode: BubbleMetricMode) => void;
  showGoldenTriangleRing: boolean;
  onToggleGoldenTriangleRing: () => void;
}

const MAP_WIDTH = 720;
const MAP_HEIGHT = 760;

const INSET_IDS = new Set(['cambridge', 'oxford', 'london', 'stevenage', 'reading']);

interface StaticMapBaseProps {
  graticulePath: string;
  neighbourPaths: { id: string; d: string }[];
  ukPath: string;
  zoom: number;
}

// Memoized heavy GeoJSON geography layer so hovering bubbles never re-renders country polygons
const StaticMapBase = memo<StaticMapBaseProps>(({ graticulePath, neighbourPaths, ukPath, zoom }) => (
  <>
    <path
      d={graticulePath}
      fill="none"
      stroke="#DFDDD5"
      strokeWidth={0.75 / zoom}
      strokeDasharray="2 3"
    />
    {neighbourPaths.map((np) => (
      <path
        key={np.id}
        d={np.d}
        fill="#E6E4DD"
        stroke="#CFCBC0"
        strokeWidth={0.75 / zoom}
      />
    ))}
    <path
      d={ukPath}
      fill="#FFFFFF"
      stroke="#9C988E"
      strokeWidth={1.1 / zoom}
    />
  </>
));
StaticMapBase.displayName = 'StaticMapBase';

const SE_COUNTY_BORDER_LINES: [number, number][][] = [
  // Oxfordshire (west, north, east with Bucks, south Thames with Berkshire)
  [[-1.72, 51.57], [-1.67, 51.74], [-1.64, 51.98], [-1.42, 52.14], [-1.18, 52.08], [-1.09, 51.90], [-0.94, 51.70], [-0.92, 51.52]],
  [[-1.72, 51.57], [-1.52, 51.52], [-1.18, 51.48], [-0.92, 51.52]],
  // Berkshire (west Wiltshire, south Hants/Surrey, east Thames/London)
  [[-1.58, 51.48], [-1.55, 51.34], [-1.25, 51.36], [-0.88, 51.35], [-0.62, 51.38], [-0.50, 51.44], [-0.48, 51.52], [-0.66, 51.54], [-0.84, 51.55], [-0.92, 51.52]],
  // Buckinghamshire / Bedfordshire east edge
  [[-1.18, 52.08], [-0.72, 52.16], [-0.62, 51.94], [-0.68, 51.80], [-0.54, 51.66], [-0.48, 51.52]],
  // Greater London boundary ring
  [[-0.48, 51.52], [-0.49, 51.61], [-0.28, 51.67], [-0.08, 51.69], [0.16, 51.64], [0.30, 51.55], [0.22, 51.46], [0.14, 51.36], [-0.04, 51.30], [-0.26, 51.34], [-0.44, 51.42], [-0.48, 51.52]],
  // Hertfordshire (north/east border with Beds, Cambs, Essex)
  [[-0.62, 51.94], [-0.54, 51.96], [-0.28, 52.04], [0.02, 52.05], [0.14, 51.94], [0.16, 51.78], [0.04, 51.68]],
  // Cambridgeshire (west/north/east border)
  [[-0.48, 52.08], [-0.45, 52.35], [-0.25, 52.62], [0.18, 52.66], [0.46, 52.45], [0.48, 52.22], [0.35, 52.05], [0.02, 52.05]],
  // Essex / Suffolk & Surrey / Kent context dividers
  [[0.35, 52.05], [0.78, 51.96], [1.28, 51.95]],
  [[-0.84, 51.35], [-0.82, 51.05]],
  [[-0.44, 51.42], [-0.44, 51.14]],
  [[0.04, 51.32], [0.06, 51.02]],
  [[-0.82, 51.12], [0.06, 51.08], [0.95, 50.95]],
];

const SE_COUNTY_LABELS: { name: string; lon: number; lat: number }[] = [
  { name: 'Oxfordshire', lon: -1.48, lat: 51.93 },
  { name: 'Berkshire', lon: -1.33, lat: 51.42 },
  { name: 'Cambridgeshire', lon: 0.12, lat: 52.46 },
  { name: 'Herts', lon: -0.44, lat: 51.82 },
  { name: 'Greater London', lon: -0.14, lat: 51.36 },
  { name: 'Essex', lon: 0.62, lat: 51.78 },
  { name: 'Kent', lon: 0.66, lat: 51.23 },
  { name: 'Surrey', lon: -0.42, lat: 51.24 },
];

export const UKClusterBubbleMap: React.FC<UKClusterBubbleMapProps> = ({
  aggregates,
  selectedClusterId,
  onSelectCluster,
  metricMode,
  onMetricModeChange,
  showGoldenTriangleRing,
  onToggleGoldenTriangleRing,
}) => {
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hoveredClusterId, setHoveredClusterId] = useState<string | null>(null);
  const [showSouthEastInset, setShowSouthEastInset] = useState<boolean>(true);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ clientX: number; clientY: number; panX: number; panY: number } | null>(null);
  const draggedDistanceRef = useRef<number>(0);

  const {
    ukPath,
    neighbourPaths,
    graticulePath,
    projection,
    insetUkPath,
    insetNeighbourPaths,
    insetGraticulePath,
    insetCountyPaths,
    insetCountyLabels,
    insetProjection,
  } = useMemo(() => {
    const topo = worldAtlas as unknown as Parameters<typeof feature>[0];
    const countriesObj = (
      worldAtlas as unknown as { objects: { countries: Parameters<typeof feature>[1] } }
    ).objects.countries;
    const fc = feature(topo, countriesObj) as unknown as FeatureCollection<Geometry>;

    const ukFeature = fc.features.find((f) => String(f.id) === '826');
    const neighbourFeatures = fc.features.filter((f) =>
      ['372', '250', '056', '528', '578'].includes(String(f.id))
    );

    const proj = geoAlbers()
      .center([0, 54.5])
      .rotate([2.7, 0])
      .parallels([50.5, 58.5])
      .scale(3550)
      .translate([MAP_WIDTH / 2 - 12, MAP_HEIGHT / 2 - 10]);

    // South East Corridor zoom framing (Oxfordshire -> Cambridgeshire -> Berkshire -> London)
    const insetProj = geoAlbers()
      .center([0, 51.55])
      .rotate([0.35, 0])
      .parallels([50.8, 52.3])
      .scale(5600)
      .translate([128, 108]);

    const pathGen = geoPath(proj);
    const insetPathGen = geoPath(insetProj);
    const grat = geoGraticule10();

    const countyPaths = SE_COUNTY_BORDER_LINES.map((coords, idx) => ({
      id: `county-${idx}`,
      d:
        insetPathGen({
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: coords },
        }) ?? '',
    }));

    const countyLabels = SE_COUNTY_LABELS.map((lbl) => {
      const xy = insetProj([lbl.lon, lbl.lat]);
      return xy ? { name: lbl.name, x: xy[0], y: xy[1] } : null;
    }).filter((item): item is { name: string; x: number; y: number } => Boolean(item));

    return {
      ukPath: ukFeature ? pathGen(ukFeature) ?? '' : '',
      neighbourPaths: neighbourFeatures.map((nf) => ({
        id: String(nf.id),
        d: pathGen(nf) ?? '',
      })),
      graticulePath: pathGen(grat) ?? '',
      projection: proj,
      insetUkPath: ukFeature ? insetPathGen(ukFeature) ?? '' : '',
      insetNeighbourPaths: neighbourFeatures
        .filter((nf) => ['250', '056'].includes(String(nf.id)))
        .map((nf) => ({
          id: String(nf.id),
          d: insetPathGen(nf) ?? '',
        })),
      insetGraticulePath: insetPathGen(grat) ?? '',
      insetCountyPaths: countyPaths,
      insetCountyLabels: countyLabels,
      insetProjection: insetProj,
    };
  }, []);

  const getMetricValue = (agg: ClusterAggregate): number => {
    if (metricMode === 'vacancies') return agg.vacancyCount;
    if (metricMode === 'labSpace') return agg.cluster.labSpaceSqFtK;
    return agg.medianSalaryGbp;
  };

  const maxVal = useMemo(() => {
    const vals = aggregates.map(getMetricValue);
    return Math.max(1, ...vals);
  }, [aggregates, metricMode]);

  const getBubbleRadius = (agg: ClusterAggregate, baseMin = 7, baseSpan = 22): number => {
    const val = getMetricValue(agg);
    if (metricMode === 'vacancies' && val === 0) return 5;
    if (metricMode === 'medianSalary') {
      const normalized = Math.max(0.2, (val - 30000) / Math.max(1, maxVal - 30000));
      return baseMin + normalized * (baseSpan - 4);
    }
    const ratio = val / maxVal;
    return baseMin + Math.sqrt(ratio) * baseSpan;
  };

  const goldenTrianglePoints = useMemo(() => {
    const ids = ['cambridge', 'oxford', 'london'];
    const coords = ids
      .map((id) => aggregates.find((a) => a.cluster.id === id))
      .filter((a): a is ClusterAggregate => Boolean(a))
      .map((a) => projection([a.cluster.lon, a.cluster.lat]))
      .filter((p): p is [number, number] => Boolean(p));

    if (coords.length < 3) return '';
    return coords.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  }, [aggregates, projection]);

  const insetTrianglePoints = useMemo(() => {
    const ids = ['cambridge', 'oxford', 'london'];
    const coords = ids
      .map((id) => aggregates.find((a) => a.cluster.id === id))
      .filter((a): a is ClusterAggregate => Boolean(a))
      .map((a) => insetProjection([a.cluster.lon, a.cluster.lat]))
      .filter((p): p is [number, number] => Boolean(p));

    if (coords.length < 3) return '';
    return coords.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  }, [aggregates, insetProjection]);

  const hoveredAgg = useMemo(
    () => aggregates.find((a) => a.cluster.id === hoveredClusterId) ?? null,
    [aggregates, hoveredClusterId]
  );

  const handleZoomIn = () => setZoom((z) => Math.min(3.2, Number((z + 0.5).toFixed(2))));
  const handleZoomOut = () => {
    setZoom((z) => {
      const next = Math.max(1, Number((z - 0.5).toFixed(2)));
      if (next === 1) setPan({ x: 0, y: 0 });
      return next;
    });
  };
  const handleResetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    onSelectCluster(null);
  };

  const handleZoomToSouthEast = () => {
    setZoom(2.1);
    setPan({ x: -530, y: -640 });
    setShowSouthEastInset(false);
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if ((e.target as HTMLElement).closest('[data-inset-control="true"]')) return;
    setIsDragging(true);
    draggedDistanceRef.current = 0;
    dragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDragging || !dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.clientX;
    const dy = e.clientY - dragStartRef.current.clientY;
    draggedDistanceRef.current = Math.hypot(dx, dy);
    setPan({
      x: Math.max(-950, Math.min(280, dragStartRef.current.panX + dx)),
      y: Math.max(-950, Math.min(280, dragStartRef.current.panY + dy)),
    });
  };

  const handlePointerUp = () => {
    setIsDragging(false);
    dragStartRef.current = null;
  };

  const handleBubbleClick = (clusterId: string) => {
    if (draggedDistanceRef.current > 5) return;
    onSelectCluster(selectedClusterId === clusterId ? null : clusterId);
  };

  const formatShortName = (name: string) =>
    name
      .replace(' & Cheshire', '')
      .replace(' & Thames Valley', '')
      .replace(' & Bath', '')
      .replace(' & Bradford', '')
      .replace(' & Craigavon', '');

  const insetAggregates = useMemo(
    () => aggregates.filter((a) => INSET_IDS.has(a.cluster.id)),
    [aggregates]
  );

  return (
    <div className="flex flex-col bg-white border border-[#E5E3DC] rounded-lg overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-[#E5E3DC] bg-[#F3F2EE]">
        <div className="flex items-center gap-1 p-1 bg-[#E7E5DE] rounded-md">
          <button
            type="button"
            onClick={() => onMetricModeChange('vacancies')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              metricMode === 'vacancies'
                ? 'bg-white text-[#1C1B18]'
                : 'text-[#57544D] hover:text-[#1C1B18]'
            }`}
          >
            Live Vacancies
          </button>
          <button
            type="button"
            onClick={() => onMetricModeChange('labSpace')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              metricMode === 'labSpace'
                ? 'bg-white text-[#1C1B18]'
                : 'text-[#57544D] hover:text-[#1C1B18]'
            }`}
          >
            Lab Capacity
          </button>
          <button
            type="button"
            onClick={() => onMetricModeChange('medianSalary')}
            className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              metricMode === 'medianSalary'
                ? 'bg-white text-[#1C1B18]'
                : 'text-[#57544D] hover:text-[#1C1B18]'
            }`}
          >
            Median Pay
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onToggleGoldenTriangleRing}
            className={`px-3 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              showGoldenTriangleRing
                ? 'bg-[#EFF4FF] border-[#BFDBFE] text-[#1E40AF]'
                : 'bg-white border-[#D6D3CB] text-[#57544D] hover:text-[#1C1B18]'
            }`}
          >
            Golden Triangle
          </button>

          <button
            type="button"
            onClick={() => setShowSouthEastInset((v) => !v)}
            className={`px-3 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              showSouthEastInset
                ? 'bg-white border-[#1C1B18] text-[#1C1B18]'
                : 'bg-white border-[#D6D3CB] text-[#57544D] hover:text-[#1C1B18]'
            }`}
          >
            {showSouthEastInset ? 'Hide SE Inset' : 'Show SE Inset'}
          </button>

          <div className="flex items-center border border-[#D6D3CB] rounded-md bg-white overflow-hidden">
            <button
              type="button"
              onClick={handleZoomOut}
              aria-label="Zoom out map"
              className="p-2 text-[#57544D] hover:text-[#1C1B18] hover:bg-[#FAF9F6] transition-colors cursor-pointer"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="px-2 text-xs font-mono tabular-nums text-[#57544D] border-x border-[#E5E3DC]">
              {zoom.toFixed(1)}x
            </span>
            <button
              type="button"
              onClick={handleZoomIn}
              aria-label="Zoom in map"
              className="p-2 text-[#57544D] hover:text-[#1C1B18] hover:bg-[#FAF9F6] transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleResetView}
              aria-label="Reset map view"
              className="p-2 text-[#57544D] hover:text-[#1C1B18] hover:bg-[#FAF9F6] border-l border-[#E5E3DC] transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* SVG Map Stage — Tightly Fitted with Zero Dead Band */}
      <div className="relative bg-[#F2F1EC] overflow-hidden select-none">
        <svg
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          className={`w-full h-auto block ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          role="img"
          aria-label="Interactive UK Life Science Job Cluster Map"
        >
          <rect x={0} y={0} width={MAP_WIDTH} height={MAP_HEIGHT} fill="#F2F1EC" />

          <g
            transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}
            style={{ transition: isDragging ? 'none' : 'transform 140ms ease-out' }}
          >
            <StaticMapBase
              graticulePath={graticulePath}
              neighbourPaths={neighbourPaths}
              ukPath={ukPath}
              zoom={zoom}
            />

            {showGoldenTriangleRing && goldenTrianglePoints && (
              <polygon
                points={goldenTrianglePoints}
                fill="#1E40AF"
                fillOpacity={0.06}
                stroke="#1E40AF"
                strokeWidth={1.2 / zoom}
                strokeDasharray={`${4 / zoom} ${3 / zoom}`}
              />
            )}

            {/* Main UK Map Bubbles */}
            {aggregates.map((agg) => {
              const projected = projection([agg.cluster.lon, agg.cluster.lat]);
              if (!projected) return null;
              const [cx, cy] = projected;
              const r = getBubbleRadius(agg) / Math.sqrt(zoom);
              const isSelected = selectedClusterId === agg.cluster.id;
              const isHovered = hoveredClusterId === agg.cluster.id;
              const isEmpty = metricMode === 'vacancies' && agg.vacancyCount === 0;
              const isInsetCluster = INSET_IDS.has(agg.cluster.id);

              const fillColor = isEmpty
                ? '#C7C3B8'
                : agg.cluster.isGoldenTriangle
                ? '#1E40AF'
                : '#57544D';

              return (
                <g
                  key={agg.cluster.id}
                  transform={`translate(${cx}, ${cy})`}
                  onClick={() => handleBubbleClick(agg.cluster.id)}
                  onMouseEnter={() => setHoveredClusterId(agg.cluster.id)}
                  onMouseLeave={() => setHoveredClusterId(null)}
                  className="cursor-pointer"
                >
                  {isSelected && (
                    <circle
                      r={r + 5 / zoom}
                      fill="none"
                      stroke="#1C1B18"
                      strokeWidth={1.75 / zoom}
                    />
                  )}

                  <circle
                    r={r}
                    fill={fillColor}
                    fillOpacity={isEmpty ? 0.45 : isHovered || isSelected ? 0.92 : 0.78}
                    stroke="#FFFFFF"
                    strokeWidth={1.5 / zoom}
                  />

                  {r * zoom >= 12 && !isEmpty && (
                    <text
                      textAnchor="middle"
                      dy="0.34em"
                      fill="#FFFFFF"
                      fontSize={10.5 / zoom}
                      fontWeight={500}
                      fontFamily="JetBrains Mono, monospace"
                      pointerEvents="none"
                    >
                      {metricMode === 'vacancies'
                        ? agg.vacancyCount
                        : metricMode === 'labSpace'
                        ? `${(agg.cluster.labSpaceSqFtK / 1000).toFixed(1)}M`
                        : `£${Math.round(agg.medianSalaryGbp / 1000)}k`}
                    </text>
                  )}

                  {(!isInsetCluster || zoom > 1.35 || !showSouthEastInset || agg.cluster.id === 'cambridge' || agg.cluster.id === 'oxford') && (
                    <text
                      x={
                        agg.cluster.id === 'oxford' || agg.cluster.id === 'reading'
                          ? -(r + 6 / zoom)
                          : agg.cluster.id === 'cambridge' || agg.cluster.id === 'stevenage'
                          ? r + 6 / zoom
                          : 0
                      }
                      y={
                        agg.cluster.id === 'oxford' || agg.cluster.id === 'cambridge' || agg.cluster.id === 'reading' || agg.cluster.id === 'stevenage'
                          ? 3 / zoom
                          : -(r + 5 / zoom)
                      }
                      textAnchor={
                        agg.cluster.id === 'oxford' || agg.cluster.id === 'reading'
                          ? 'end'
                          : agg.cluster.id === 'cambridge' || agg.cluster.id === 'stevenage'
                          ? 'start'
                          : 'middle'
                      }
                      fill={isSelected ? '#1C1B18' : '#3E3C37'}
                      fontSize={11 / zoom}
                      fontWeight={isSelected ? 600 : 500}
                      fontFamily="Plus Jakarta Sans, sans-serif"
                      pointerEvents="none"
                      style={{
                        paintOrder: 'stroke',
                        stroke: '#FFFFFF',
                        strokeWidth: `${2.5 / zoom}px`,
                        strokeLinejoin: 'round',
                      }}
                    >
                      {formatShortName(agg.cluster.name)}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {/* Closable & Navigable South East Corridor Inset with Coastline & County Lines */}
        {showSouthEastInset && (
          <div
            data-inset-control="true"
            className="absolute bottom-4 right-4 w-[256px] bg-[#FAF9F6] border border-[#C7C3B8] rounded-md overflow-hidden shadow-xs"
          >
            <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-[#F3F2EE] border-b border-[#D6D3CB]">
              <span className="text-[11px] font-semibold text-[#1C1B18]">
                South East Corridor · Counties
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleZoomToSouthEast}
                  title="Zoom main map into South East"
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-medium text-[#1E40AF] hover:bg-[#EFF4FF] rounded cursor-pointer"
                >
                  <Maximize2 className="w-3 h-3" />
                  Zoom
                </button>
                <button
                  type="button"
                  onClick={() => setShowSouthEastInset(false)}
                  aria-label="Close South East inset"
                  className="p-0.5 text-[#57544D] hover:text-[#1C1B18] rounded cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <svg viewBox="0 0 256 212" className="w-full h-auto block bg-[#EAE8E0]">
              <defs>
                <clipPath id="se-corridor-uk-clip">
                  <path d={insetUkPath} />
                </clipPath>
              </defs>
              <path
                d={insetGraticulePath}
                fill="none"
                stroke="#DCD9CF"
                strokeWidth={0.75}
                strokeDasharray="2 3"
              />
              {insetNeighbourPaths.map((np) => (
                <path
                  key={`inset-nb-${np.id}`}
                  d={np.d}
                  fill="#E4E1D8"
                  stroke="#C7C3B8"
                  strokeWidth={0.9}
                />
              ))}
              <path d={insetUkPath} fill="#FFFFFF" stroke="#8C887F" strokeWidth={1.25} />
              <g clipPath="url(#se-corridor-uk-clip)">
                {insetCountyPaths.map((cp) => (
                  <path
                    key={cp.id}
                    d={cp.d}
                    fill="none"
                    stroke="#B8B3A6"
                    strokeWidth={0.75}
                    strokeDasharray="2.5 2"
                  />
                ))}
                {insetCountyLabels.map((lbl) => (
                  <text
                    key={lbl.name}
                    x={lbl.x}
                    y={lbl.y}
                    textAnchor="middle"
                    fill="#9C988E"
                    fontSize={6.8}
                    fontWeight={500}
                    fontFamily="Plus Jakarta Sans, sans-serif"
                    pointerEvents="none"
                  >
                    {lbl.name}
                  </text>
                ))}
              </g>
              {showGoldenTriangleRing && insetTrianglePoints && (
                <polygon
                  points={insetTrianglePoints}
                  fill="#1E40AF"
                  fillOpacity={0.07}
                  stroke="#1E40AF"
                  strokeWidth={1}
                  strokeDasharray="3 2"
                />
              )}
              {insetAggregates.map((agg) => {
                const coords = insetProjection([agg.cluster.lon, agg.cluster.lat]);
                if (!coords) return null;
                const [ix, iy] = coords;
                const r = getBubbleRadius(agg, 5.5, 11);
                const isSelected = selectedClusterId === agg.cluster.id;
                const isEmpty = metricMode === 'vacancies' && agg.vacancyCount === 0;
                const labelOffset =
                  agg.cluster.id === 'stevenage'
                    ? { dx: r + 5, dy: -2, anchor: 'start' as const }
                    : agg.cluster.id === 'reading'
                    ? { dx: -(r + 5), dy: 4, anchor: 'end' as const }
                    : agg.cluster.id === 'oxford'
                    ? { dx: -(r + 5), dy: 2, anchor: 'end' as const }
                    : agg.cluster.id === 'london'
                    ? { dx: r + 5, dy: 6, anchor: 'start' as const }
                    : { dx: 0, dy: -(r + 5), anchor: 'middle' as const };

                return (
                  <g
                    key={`inset-${agg.cluster.id}`}
                    transform={`translate(${ix}, ${iy})`}
                    onClick={() => onSelectCluster(isSelected ? null : agg.cluster.id)}
                    onMouseEnter={() => setHoveredClusterId(agg.cluster.id)}
                    onMouseLeave={() => setHoveredClusterId(null)}
                    className="cursor-pointer"
                  >
                    {isSelected && (
                      <circle r={r + 4} fill="none" stroke="#1C1B18" strokeWidth={1.5} />
                    )}
                    <circle
                      r={r}
                      fill={isEmpty ? '#C7C3B8' : agg.cluster.isGoldenTriangle ? '#1E40AF' : '#57544D'}
                      fillOpacity={0.88}
                      stroke="#FFFFFF"
                      strokeWidth={1.25}
                    />
                    {!isEmpty && (
                      <text
                        textAnchor="middle"
                        dy="0.34em"
                        fill="#FFFFFF"
                        fontSize={8.5}
                        fontWeight={500}
                        fontFamily="JetBrains Mono, monospace"
                        pointerEvents="none"
                      >
                        {metricMode === 'vacancies'
                          ? agg.vacancyCount
                          : metricMode === 'labSpace'
                          ? `${(agg.cluster.labSpaceSqFtK / 1000).toFixed(1)}`
                          : `${Math.round(agg.medianSalaryGbp / 1000)}k`}
                      </text>
                    )}
                    <text
                      x={labelOffset.dx}
                      y={labelOffset.dy}
                      textAnchor={labelOffset.anchor}
                      fill="#1C1B18"
                      fontSize={9.5}
                      fontWeight={isSelected ? 600 : 500}
                      fontFamily="Plus Jakarta Sans, sans-serif"
                      pointerEvents="none"
                      style={{
                        paintOrder: 'stroke',
                        stroke: '#FFFFFF',
                        strokeWidth: '2.5px',
                        strokeLinejoin: 'round',
                      }}
                    >
                      {formatShortName(agg.cluster.name)}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        )}

        {/* Quiet Map Legend (Bottom Left) */}
        <div className="absolute bottom-4 left-4 bg-white border border-[#D6D3CB] rounded-md px-3 py-2 text-xs text-[#57544D] space-y-1">
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-2">
              <svg width="10" height="10" aria-hidden="true">
                <rect width="10" height="10" rx="2" fill="#1E40AF" />
              </svg>
              Golden Triangle
            </span>
            <span className="inline-flex items-center gap-2">
              <svg width="10" height="10" aria-hidden="true">
                <rect width="10" height="10" rx="2" fill="#57544D" />
              </svg>
              Regional Hub
            </span>
          </div>
          <div className="text-[11px] text-[#78756E] font-mono">
            Drag map to pan · Click cluster to filter
          </div>
        </div>

        {/* Hover Readout Box (Top Right) */}
        {hoveredAgg && (
          <div className="pointer-events-none absolute top-4 right-4 w-64 bg-[#1C1B18] text-[#FAF9F6] rounded-md p-3 border border-[#3E3C37]">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium">{hoveredAgg.cluster.name}</span>
              <span className="text-xs font-mono text-[#B8B4AB]">{hoveredAgg.cluster.region}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-3 text-xs border-t border-[#3E3C37] pt-2">
              <div>
                <div className="text-[11px] text-[#B8B4AB]">Matching Roles</div>
                <div className="font-mono font-medium tabular-nums">{hoveredAgg.vacancyCount}</div>
              </div>
              <div>
                <div className="text-[11px] text-[#B8B4AB]">Median Salary</div>
                <div className="font-mono font-medium tabular-nums">
                  {hoveredAgg.medianSalaryGbp > 0
                    ? `£${Math.round(hoveredAgg.medianSalaryGbp).toLocaleString('en-GB')}`
                    : '—'}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-[#B8B4AB]">Graduate Share</div>
                <div className="font-mono tabular-nums">{hoveredAgg.juniorSharePct}%</div>
              </div>
              <div>
                <div className="text-[11px] text-[#B8B4AB]">Lab Space</div>
                <div className="font-mono tabular-nums">
                  {(hoveredAgg.cluster.labSpaceSqFtK / 1000).toFixed(2)}M sq ft
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
