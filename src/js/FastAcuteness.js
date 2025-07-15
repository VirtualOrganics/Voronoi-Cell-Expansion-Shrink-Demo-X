/**
 * FastAcuteness.js
 * 
 * Ultra-optimized acuteness calculations for 1000+ points with live updates
 * Uses JavaScript optimization techniques to achieve near-WASM performance
 */

// Pre-allocate arrays to avoid garbage collection
const vec1 = new Float32Array(3);
const vec2 = new Float32Array(3);
const tempDistances = new Float32Array(1000); // Pre-allocated for sorting
const tempIndices = new Uint16Array(1000);

/**
 * Fast angle calculation using pre-allocated arrays
 */
function fastAngle(x1, y1, z1, x2, y2, z2) {
    const dot = x1 * x2 + y1 * y2 + z1 * z2;
    const len1Sq = x1 * x1 + y1 * y1 + z1 * z1;
    const len2Sq = x2 * x2 + y2 * y2 + z2 * z2;
    
    if (len1Sq === 0 || len2Sq === 0) return 0;
    
    // Fast approximation of acos for small datasets
    const cosTheta = dot / Math.sqrt(len1Sq * len2Sq);
    
    // Use lookup table for common angles (optional optimization)
    // For now, use Math.acos but could be replaced with approximation
    return Math.acos(Math.max(-1, Math.min(1, cosTheta)));
}

/**
 * Ultra-fast cell acuteness for live updates
 * Optimized for 1000+ points
 */
export class FastCellAcuteness {
    constructor() {
        this.previousScores = new Float32Array(10000); // Pre-allocate
        this.dirtyFlags = new Uint8Array(10000);
        this.HALF_PI = Math.PI / 2;
        this.lastUpdateTime = 0;
        this.updateInterval = 33; // ~30 FPS
    }
    
    /**
     * Calculate cell acuteness with optimizations
     */
    calculate(cells, options = {}) {
        const startTime = performance.now();
        const cellCount = cells.size;
        const scores = new Float32Array(cellCount);
        
        // Options for performance tuning
        const maxNeighbors = options.maxNeighbors || 6;
        const isPreview = options.isPreview || false;
        const skipRatio = isPreview ? 4 : 1; // Sample every Nth cell in preview
        const isPeriodic = options.isPeriodic !== undefined ? options.isPeriodic : true;
        const points = options.points || [];
        
        // Detect boundary cells in non-periodic mode with nuanced scoring
        let boundaryCells = new Map();
        if (!isPeriodic && points.length > 0) {
            const boundaryThreshold = 0.1;
            points.forEach((point, idx) => {
                const [x, y, z] = point;
                
                // Calculate how "boundary" this cell is
                let boundaryScore = 0;
                let numBoundaries = 0;
                
                // Check each dimension
                if (x < boundaryThreshold) { 
                    boundaryScore += (boundaryThreshold - x) / boundaryThreshold; 
                    numBoundaries++; 
                } else if (x > 1 - boundaryThreshold) { 
                    boundaryScore += (x - (1 - boundaryThreshold)) / boundaryThreshold; 
                    numBoundaries++; 
                }
                
                if (y < boundaryThreshold) { 
                    boundaryScore += (boundaryThreshold - y) / boundaryThreshold; 
                    numBoundaries++; 
                } else if (y > 1 - boundaryThreshold) { 
                    boundaryScore += (y - (1 - boundaryThreshold)) / boundaryThreshold; 
                    numBoundaries++; 
                }
                
                if (z < boundaryThreshold) { 
                    boundaryScore += (boundaryThreshold - z) / boundaryThreshold; 
                    numBoundaries++; 
                } else if (z > 1 - boundaryThreshold) { 
                    boundaryScore += (z - (1 - boundaryThreshold)) / boundaryThreshold; 
                    numBoundaries++; 
                }
                
                if (numBoundaries > 0) {
                    boundaryScore = boundaryScore / numBoundaries;
                    boundaryCells.set(idx, {
                        score: boundaryScore,
                        numBoundaries: numBoundaries
                    });
                }
            });
            console.log(`FastCellAcuteness: Detected ${boundaryCells.size} boundary cells`);
        }
        
        let cellIdx = 0;
        let processedCount = 0;
        
        for (const [vertexIndex, cellVertices] of cells.entries()) {
            // Skip sampling for preview mode
            if (isPreview && cellIdx % skipRatio !== 0) {
                scores[cellIdx] = 0;
                cellIdx++;
                continue;
            }
            
            // Validate cell vertices
            if (!cellVertices || cellVertices.length < 4) {
                scores[cellIdx] = 0;
                cellIdx++;
                continue;
            }
            
            // Check if this is a boundary cell
            const boundaryInfo = boundaryCells.get(vertexIndex);
            const isBoundaryCell = !isPeriodic && boundaryInfo !== undefined;
            
            // Fast calculation without allocations
            let acuteAngles = 0;
            const vertCount = cellVertices.length;
            
            // Limit vertices checked for performance
            const maxVerts = isPreview ? Math.min(4, vertCount) : Math.min(8, vertCount);
            
            for (let i = 0; i < maxVerts; i++) {
                const center = cellVertices[i];
                if (!center || center.length !== 3) {
                    console.warn(`Invalid vertex at index ${i} in cell ${cellIdx}`);
                    continue;
                }
                
                const cx = center[0], cy = center[1], cz = center[2];
                
                // Check limited neighbors
                const neighborCount = Math.min(maxNeighbors, maxVerts - 1);
                
                for (let j = 1; j <= neighborCount && (i + j) < maxVerts; j++) {
                    const idx1 = (i + j) % maxVerts;
                    const v1 = cellVertices[idx1];
                    if (!v1 || v1.length !== 3) continue;
                    
                    // Vector from center to v1
                    const v1x = v1[0] - cx;
                    const v1y = v1[1] - cy;
                    const v1z = v1[2] - cz;
                    
                    for (let k = j + 1; k <= neighborCount && (i + k) < maxVerts; k++) {
                        const idx2 = (i + k) % maxVerts;
                        const v2 = cellVertices[idx2];
                        if (!v2 || v2.length !== 3) continue;
                        
                        // Vector from center to v2
                        const v2x = v2[0] - cx;
                        const v2y = v2[1] - cy;
                        const v2z = v2[2] - cz;
                        
                        // Fast angle calculation using dot product
                        const dot = v1x * v2x + v1y * v2y + v1z * v2z;
                        const mag1Sq = v1x * v1x + v1y * v1y + v1z * v1z;
                        const mag2Sq = v2x * v2x + v2y * v2y + v2z * v2z;
                        
                        // Avoid division by zero
                        if (mag1Sq === 0 || mag2Sq === 0) continue;
                        
                        // cos(angle) = dot / (|v1| * |v2|)
                        // For acute angle, cos > 0 and angle < PI/2
                        const cosAngle = dot / Math.sqrt(mag1Sq * mag2Sq);
                        
                        if (cosAngle > 0 && cosAngle < 1) { // Acute angle
                            acuteAngles++;
                        }
                    }
                }
            }
            
            // Don't normalize by cell size - acute angles are scale-invariant!
            // The issue was that larger cells (fewer points) have more vertices,
            // so dividing by maxVerts was artificially reducing scores
            let finalScore = acuteAngles;
            
            // Adjust for boundary cells with nuanced approach
            if (isBoundaryCell && boundaryInfo) {
                // Calculate adjustment factor based on boundary characteristics
                const baseFactor = 0.7 + (0.3 * (1 - boundaryInfo.score)); // 0.7 to 1.0
                const scoreFactor = 1.0 - (0.3 * Math.min(finalScore / 50, 1)); // Adjusted for non-normalized scores
                const adjustmentFactor = baseFactor * scoreFactor;
                
                finalScore = Math.round(finalScore * adjustmentFactor);
            }
            
            scores[cellIdx] = Math.min(finalScore, 255); // Cap at reasonable max
            processedCount++;
            cellIdx++;
        }
        
        // Store for incremental updates
        this.previousScores = scores;
        
        const endTime = performance.now();
        console.log(`FastCellAcuteness: Processed ${processedCount}/${cellCount} cells in ${(endTime - startTime).toFixed(2)}ms`);
        
        // Validate output
        const validScores = Array.from(scores).filter(s => !isNaN(s) && isFinite(s));
        if (validScores.length !== scores.length) {
            console.error('FastCellAcuteness produced invalid scores!');
        }
        
        return scores;
    }
    
    /**
     * Incremental update for animation
     */
    updateIncremental(cells, changedCells, options = {}) {
        const now = performance.now();
        
        // Throttle updates
        if (now - this.lastUpdateTime < this.updateInterval) {
            return this.previousScores;
        }
        
        this.lastUpdateTime = now;
        
        // If too many changes, do preview calculation
        if (changedCells.size > cells.size * 0.3) {
            return this.calculate(cells, { ...options, isPreview: true });
        }
        
        // Otherwise, update only changed cells
        const scores = new Float32Array(this.previousScores);
        
        for (const cellIdx of changedCells) {
            const cellVertices = cells.get(cellIdx);
            if (!cellVertices || cellVertices.length < 4) {
                scores[cellIdx] = 0;
                continue;
            }
            
            // Quick calculation for single cell
            let acuteCount = 0;
            const vertCount = Math.min(6, cellVertices.length); // Limit for speed
            
            for (let i = 0; i < vertCount; i++) {
                const center = cellVertices[i];
                const cx = center[0], cy = center[1], cz = center[2];
                
                // Only check 3 nearest neighbors for speed
                for (let j = i + 1; j < Math.min(i + 4, vertCount); j++) {
                    const v = cellVertices[j % vertCount];
                    const vx = v[0] - cx;
                    const vy = v[1] - cy;
                    const vz = v[2] - cz;
                    
                    // Quick angle approximation
                    const dot = vx*vx + vy*vy + vz*vz;
                    if (dot < 0.5) { // Rough approximation for acute
                        acuteCount++;
                    }
                }
            }
            
            scores[cellIdx] = Math.round(acuteCount / vertCount);
        }
        
        this.previousScores = scores;
        return scores;
    }
}

/**
 * Adaptive quality manager for maintaining frame rate
 */
export class AdaptiveQuality {
    constructor(targetFPS = 30) {
        this.targetFPS = targetFPS;
        this.frameTimings = new Float32Array(10);
        this.frameIndex = 0;
        this.quality = 'high';
        this.qualitySettings = {
            high: { maxNeighbors: 6, skipRatio: 0, updateInterval: 33 },
            medium: { maxNeighbors: 4, skipRatio: 0.3, updateInterval: 50 },
            low: { maxNeighbors: 3, skipRatio: 0.6, updateInterval: 100 }
        };
    }
    
    recordFrame(deltaTime) {
        this.frameTimings[this.frameIndex] = deltaTime;
        this.frameIndex = (this.frameIndex + 1) % this.frameTimings.length;
        
        // Calculate average FPS
        const avgDelta = this.frameTimings.reduce((a, b) => a + b) / this.frameTimings.length;
        const currentFPS = 1000 / avgDelta;
        
        // Adjust quality
        if (currentFPS < this.targetFPS * 0.8) {
            this.decreaseQuality();
        } else if (currentFPS > this.targetFPS * 1.2 && this.quality !== 'high') {
            this.increaseQuality();
        }
    }
    
    decreaseQuality() {
        if (this.quality === 'high') {
            this.quality = 'medium';
            console.log('Reducing to medium quality for performance');
        } else if (this.quality === 'medium') {
            this.quality = 'low';
            console.log('Reducing to low quality for performance');
        }
    }
    
    increaseQuality() {
        if (this.quality === 'low') {
            this.quality = 'medium';
        } else if (this.quality === 'medium') {
            this.quality = 'high';
        }
    }
    
    getSettings() {
        return this.qualitySettings[this.quality];
    }
}

/**
 * Main class for fast acuteness analysis with live updates
 */
export class FastAcutenessAnalyzer {
    constructor() {
        this.cellAnalyzer = new FastCellAcuteness();
        this.qualityManager = new AdaptiveQuality();
        this.lastPositions = new Map();
        this.movementThreshold = 0.001; // Minimum movement to trigger update
        this.HALF_PI = Math.PI / 2; // Add this constant
    }
    
    /**
     * Analyze with optimizations for 1000+ points
     */
    analyze(computation, options = {}) {
        const startTime = performance.now();
        
        // Get quality settings
        const qualitySettings = this.qualityManager.getSettings();
        const analysisOptions = { 
            ...qualitySettings, 
            ...options,
            isPeriodic: computation.isPeriodic,
            points: computation.getPoints()
        };
        
        // Detect which cells changed
        const changedCells = this.detectChangedCells(computation);
        
        // Use incremental update if possible
        const cells = computation.getCells();
        let cellScores;
        
        if (changedCells.size === 0) {
            // No changes, return cached results
            cellScores = this.cellAnalyzer.previousScores;
        } else if (changedCells.size < cells.size * 0.3) {
            // Incremental update
            cellScores = this.cellAnalyzer.updateIncremental(cells, changedCells, analysisOptions);
        } else {
            // Full recalculation with quality settings
            cellScores = this.cellAnalyzer.calculate(cells, analysisOptions);
        }
        
        // Record frame timing
        const frameTime = performance.now() - startTime;
        this.qualityManager.recordFrame(frameTime);
        
        // Compute face and vertex scores only if needed
        let faceScores = [];
        let vertexScores = [];
        let edgeScores = [];
        
        // Check if we need face or vertex scores (by checking if those checkboxes exist and are checked)
        const needsFaceScores = options.includeFaces !== false;
        const needsVertexScores = options.includeVertices !== false;
        const needsEdgeScores = options.includeEdges !== false;
        
        if (needsFaceScores) {
            const faces = computation.getFaces();
            faceScores = new Array(faces.length);
            
            // Simple face scoring - count vertices
            faces.forEach((face, idx) => {
                // Faces with more vertices tend to have more acute angles
                faceScores[idx] = Math.max(0, face.voronoiVertices.length - 3);
            });
        }
        
        if (needsVertexScores) {
            const vertices = computation.getVertices();
            vertexScores = new Array(vertices.length);
            
            // Simple vertex scoring - could be enhanced
            for (let i = 0; i < vertices.length; i++) {
                // Placeholder - in practice would analyze tetrahedron quality
                vertexScores[i] = Math.floor(Math.random() * 6);
            }
        }
        
        if (needsEdgeScores) {
            const edges = computation.voronoiEdges || [];
            edgeScores = new Array(edges.length);
            
            // Simple edge scoring
            for (let i = 0; i < edges.length; i++) {
                // Placeholder - would analyze edge connectivity
                edgeScores[i] = Math.floor(Math.random() * 4);
            }
        }
        
        const endTime = performance.now();
        console.log(`FastAcutenessAnalyzer: Total analysis time ${(endTime - startTime).toFixed(2)}ms`);
        
        return {
            cellScores: Array.from(cellScores),
            faceScores,
            vertexScores,
            edgeScores
        };
    }
    
    /**
     * Detect which cells have changed
     */
    detectChangedCells(computation) {
        const changed = new Set();
        const points = computation.getPoints();
        
        points.forEach((point, idx) => {
            const prev = this.lastPositions.get(idx);
            if (!prev) {
                changed.add(idx);
                this.lastPositions.set(idx, [...point]);
            } else {
                const dx = point[0] - prev[0];
                const dy = point[1] - prev[1];
                const dz = point[2] - prev[2];
                
                if (dx*dx + dy*dy + dz*dz > this.movementThreshold * this.movementThreshold) {
                    changed.add(idx);
                    this.lastPositions.set(idx, [...point]);
                }
            }
        });
        
        return changed;
    }
} 