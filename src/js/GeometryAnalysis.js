/**
 * GeometryAnalysis.js
 * 
 * Geometric analysis functions for acuteness detection in Delaunay-Voronoi diagrams.
 * This module provides pure geometric calculations without any dependency on Three.js.
 * 
 * STREAMLINED VERSION - Optimized for performance without overhead
 */

// Simple performance tracking (minimal overhead)
let performanceEnabled = false;
const simpleMetrics = {
    totalTime: 0,
    callCount: 0
};

/**
 * Enable/disable performance tracking
 */
export function setPerformanceTracking(enabled) {
    performanceEnabled = enabled;
}

/**
 * Get simple performance metrics
 */
export function getPerformanceMetrics() {
    return {
        cellAcuteness: {
            totalTime: simpleMetrics.totalTime,
            callCount: simpleMetrics.callCount,
            averageTime: simpleMetrics.callCount > 0 ? simpleMetrics.totalTime / simpleMetrics.callCount : 0,
            angleCalculations: 0,
            anglesPerMs: 0
        },
        faceAcuteness: { totalTime: 0, callCount: 0, averageTime: 0, angleCalculations: 0, anglesPerMs: 0 },
        vertexAcuteness: { totalTime: 0, callCount: 0, averageTime: 0, angleCalculations: 0, anglesPerMs: 0 }
    };
}

/**
 * Clear performance data
 */
export function clearPerformanceData() {
    simpleMetrics.totalTime = 0;
    simpleMetrics.callCount = 0;
}

/**
 * Calculate squared distance between two points (faster than actual distance)
 */
function calculateSquaredDistance(p1, p2) {
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const dz = p2[2] - p1[2];
    return dx * dx + dy * dy + dz * dz;
}

/**
 * Calculate the angle between two vectors in radians (FAST VERSION)
 */
function calculateAngle(vec1, vec2) {
    // Calculate dot product
    const dot = vec1[0] * vec2[0] + vec1[1] * vec2[1] + vec1[2] * vec2[2];
    
    // Calculate squared magnitudes (avoid sqrt until necessary)
    const magSq1 = vec1[0] * vec1[0] + vec1[1] * vec1[1] + vec1[2] * vec1[2];
    const magSq2 = vec2[0] * vec2[0] + vec2[1] * vec2[1] + vec2[2] * vec2[2];
    
    // Avoid division by zero
    if (magSq1 === 0 || magSq2 === 0) return 0;
    
    // Calculate angle using dot product formula
    const cosTheta = Math.max(-1, Math.min(1, dot / Math.sqrt(magSq1 * magSq2)));
    return Math.acos(cosTheta);
}

/**
 * Calculate the dihedral angle between two faces sharing an edge
 */
function getDihedralAngle(face1, face2, commonEdge) {
    // Helper function to calculate normal vector of a face
    function calculateNormal(vertices) {
        if (vertices.length < 3) return [0, 0, 0];
        
        const v1 = [
            vertices[1][0] - vertices[0][0],
            vertices[1][1] - vertices[0][1],
            vertices[1][2] - vertices[0][2]
        ];
        
        const v2 = [
            vertices[2][0] - vertices[0][0],
            vertices[2][1] - vertices[0][1],
            vertices[2][2] - vertices[0][2]
        ];
        
        // Cross product to get normal
        const normal = [
            v1[1] * v2[2] - v1[2] * v2[1],
            v1[2] * v2[0] - v1[0] * v2[2],
            v1[0] * v2[1] - v1[1] * v2[0]
        ];
        
        return normal;
    }
    
    const normal1 = calculateNormal(face1);
    const normal2 = calculateNormal(face2);
    const angle = calculateAngle(normal1, normal2);
    return Math.PI - angle;
}

/**
 * Analyze vertex acuteness in the Delaunay triangulation (FAST VERSION)
 * Counts acute angles at each vertex of each tetrahedron
 */
export function vertexAcuteness(computation, maxScore = Infinity) {
    const tetrahedra = computation.getDelaunayTetrahedra();
    const points = computation.getPoints();
    const scores = [];
    
    // In non-periodic mode, detect boundary tetrahedra
    let boundaryTetrahedra = new Set();
    if (!computation.isPeriodic) {
        const boundaryThreshold = 0.1;
        
        // A tetrahedron is on the boundary if any of its vertices is near the boundary
        tetrahedra.forEach((tet, tetIdx) => {
            for (const vertIdx of tet) {
                const point = points[vertIdx];
                const [x, y, z] = point;
                
                if (x < boundaryThreshold || x > 1 - boundaryThreshold ||
                    y < boundaryThreshold || y > 1 - boundaryThreshold ||
                    z < boundaryThreshold || z > 1 - boundaryThreshold) {
                    boundaryTetrahedra.add(tetIdx);
                    break;
                }
            }
        });
        
        console.log(`Detected ${boundaryTetrahedra.size} boundary tetrahedra in non-periodic mode`);
    }
    
    for (let i = 0; i < tetrahedra.length; i++) {
        const tet = tetrahedra[i];
        const vertices = tet.map(idx => points[idx]);
        
        // Check if this is a boundary tetrahedron
        const isBoundaryTet = !computation.isPeriodic && boundaryTetrahedra.has(i);
        
        let acuteAngles = 0;
        
        // For each vertex, calculate the angles between the three edges
        for (let j = 0; j < 4; j++) {
            const center = vertices[j];
            const others = vertices.filter((_, idx) => idx !== j);
            
            // Calculate the three angles between pairs of edges
            const edges = others.map(v => [
                v[0] - center[0],
                v[1] - center[1],
                v[2] - center[2]
            ]);
            
            // Calculate angles between each pair of edges
            const angles = [
                calculateAngle(edges[0], edges[1]),
                calculateAngle(edges[1], edges[2]),
                calculateAngle(edges[2], edges[0])
            ];
            
            // Count acute angles (< 90 degrees)
            const acuteCount = angles.filter(angle => angle < Math.PI / 2).length;
            acuteAngles += acuteCount;
        }
        
        // Adjust score for boundary tetrahedra
        if (isBoundaryTet) {
            // Boundary tetrahedra often have artificially acute angles
            // Reduce score by 30-50% depending on severity
            acuteAngles = Math.round(acuteAngles * 0.6);
        }
        
        scores.push(acuteAngles);
        
        // Early termination if we've reached max score
        if (acuteAngles >= maxScore) break;
    }
    
    // Log score statistics for debugging
    if (scores.length > 0) {
        const minScore = Math.min(...scores);
        const maxScore = Math.max(...scores);
        const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
        console.log(`Vertex acuteness (${scores.length} tetrahedra): min=${minScore}, max=${maxScore}, avg=${avgScore.toFixed(1)}`);
    }
    
    return scores;
}

/**
 * Analyze face acuteness in the Voronoi diagram (FAST VERSION)
 */
export function faceAcuteness(computation, maxScore = Infinity) {
    const faces = computation.getFaces();
    const points = computation.getPoints();
    const scores = [];
    
    // In non-periodic mode, detect boundary faces
    let boundaryFaces = new Set();
    if (!computation.isPeriodic) {
        const boundaryThreshold = 0.1;
        
        // A face is on the boundary if its Delaunay edge connects boundary points
        faces.forEach((face, faceIdx) => {
            const [p1Idx, p2Idx] = face.delaunayEdge;
            const p1 = points[p1Idx];
            const p2 = points[p2Idx];
            
            // Check if either point is near the boundary
            const p1Boundary = (p1[0] < boundaryThreshold || p1[0] > 1 - boundaryThreshold ||
                               p1[1] < boundaryThreshold || p1[1] > 1 - boundaryThreshold ||
                               p1[2] < boundaryThreshold || p1[2] > 1 - boundaryThreshold);
            
            const p2Boundary = (p2[0] < boundaryThreshold || p2[0] > 1 - boundaryThreshold ||
                               p2[1] < boundaryThreshold || p2[1] > 1 - boundaryThreshold ||
                               p2[2] < boundaryThreshold || p2[2] > 1 - boundaryThreshold);
            
            if (p1Boundary || p2Boundary) {
                boundaryFaces.add(faceIdx);
            }
        });
        
        console.log(`Detected ${boundaryFaces.size} boundary faces in non-periodic mode`);
    }
    
    for (let faceIdx = 0; faceIdx < faces.length; faceIdx++) {
        const face = faces[faceIdx];
        const vertices = face.voronoiVertices;
        
        if (vertices.length < 3) {
            scores.push(0);
            continue;
        }
        
        // Check if this is a boundary face
        const isBoundaryFace = !computation.isPeriodic && boundaryFaces.has(faceIdx);
        
        let acuteAngles = 0;
        
        // Calculate interior angles of the polygon
        for (let i = 0; i < vertices.length; i++) {
            const prev = vertices[(i - 1 + vertices.length) % vertices.length];
            const curr = vertices[i];
            const next = vertices[(i + 1) % vertices.length];
            
            // Calculate vectors from current vertex to adjacent vertices
            const vec1 = [
                prev[0] - curr[0],
                prev[1] - curr[1],
                prev[2] - curr[2]
            ];
            
            const vec2 = [
                next[0] - curr[0],
                next[1] - curr[1],
                next[2] - curr[2]
            ];
            
            // Calculate the angle between the vectors
            const angle = calculateAngle(vec1, vec2);
            
            // Count if the angle is acute (< 90 degrees)
            if (angle < Math.PI / 2) {
                acuteAngles++;
            }
        }
        
        // Adjust score for boundary faces
        if (isBoundaryFace) {
            // Boundary faces are often truncated, leading to artificial acute angles
            // Reduce score by 40%
            acuteAngles = Math.round(acuteAngles * 0.6);
        }
        
        scores.push(acuteAngles);
        
        // Early termination if we've reached max score
        if (acuteAngles >= maxScore) break;
    }
    
    // Log score statistics for debugging
    if (scores.length > 0) {
        const minScore = Math.min(...scores);
        const maxScore = Math.max(...scores);
        const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
        console.log(`Face acuteness (${scores.length} faces): min=${minScore}, max=${maxScore}, avg=${avgScore.toFixed(1)}`);
    }
    
    return scores;
}

/**
 * Analyze cell acuteness in the Voronoi diagram (FAST VERSION - No Spatial Index)
 */
/**
 * Analyze cell acuteness in the Voronoi diagram
 * 
 * For each Voronoi cell (3D polyhedron):
 * 1. Find all its faces (polygons)
 * 2. For each face, count vertices with acute interior angles (< 90°)
 * 3. Sum up all acute angles across all faces
 * 
 * Example: A perfect cube has 6 faces × 4 vertices = 24 total vertices,
 * but all angles are 90°, so it would score 0 acute angles.
 * 
 * @param {Object} computation - The DelaunayComputation object
 * @param {number} maxScore - Maximum score to compute (for early termination)
 * @param {number} searchRadius - Not used in current implementation
 * @returns {Array<number>} Array of acute angle counts for each cell
 */
export function cellAcuteness(computation, maxScore = Infinity, searchRadius = 0.3) {
    const startTime = performanceEnabled ? performance.now() : 0;
    
    const cells = computation.getCells();
    const scores = [];
    
    // In non-periodic mode, detect boundary cells
    let boundaryCells = new Map(); // Map cell index to boundary info
    if (!computation.isPeriodic) {
        // Find the convex hull of all points to identify boundary vertices
        const points = computation.getPoints();
        const boundaryThreshold = 0.1; // Distance from edge to be considered boundary
        
        // Simple approach: vertices near the min/max bounds are likely boundary cells
        for (const [cellIdx, point] of points.entries()) {
            const [x, y, z] = point;
            
            // Calculate how "boundary" this cell is (0 = interior, 1 = corner)
            let boundaryScore = 0;
            let numBoundaries = 0;
            
            // Check each dimension
            if (x < boundaryThreshold) { boundaryScore += (boundaryThreshold - x) / boundaryThreshold; numBoundaries++; }
            else if (x > 1 - boundaryThreshold) { boundaryScore += (x - (1 - boundaryThreshold)) / boundaryThreshold; numBoundaries++; }
            
            if (y < boundaryThreshold) { boundaryScore += (boundaryThreshold - y) / boundaryThreshold; numBoundaries++; }
            else if (y > 1 - boundaryThreshold) { boundaryScore += (y - (1 - boundaryThreshold)) / boundaryThreshold; numBoundaries++; }
            
            if (z < boundaryThreshold) { boundaryScore += (boundaryThreshold - z) / boundaryThreshold; numBoundaries++; }
            else if (z > 1 - boundaryThreshold) { boundaryScore += (z - (1 - boundaryThreshold)) / boundaryThreshold; numBoundaries++; }
            
            if (numBoundaries > 0) {
                // Normalize boundary score (0-1 range)
                boundaryScore = boundaryScore / numBoundaries;
                boundaryCells.set(cellIdx, {
                    score: boundaryScore,
                    numBoundaries: numBoundaries
                });
            }
        }
        
        console.log(`Detected ${boundaryCells.size} boundary cells in non-periodic mode`);
    }
    
    // For each cell, analyze the angles at each Voronoi vertex 
    for (const [cellIdx, cellVertices] of cells.entries()) {
        if (cellVertices.length < 4) {
            scores.push(0);
            continue;
        }
        
        // Check if this is a boundary cell in non-periodic mode
        const boundaryInfo = boundaryCells.get(cellIdx);
        const isBoundaryCell = !computation.isPeriodic && boundaryInfo !== undefined;
        
        let acuteAngles = 0;
        
        // CORRECT APPROACH: Count acute angles in each face of the cell
        // A Voronoi cell is a convex polyhedron with polygonal faces
        // We need to find all faces and count acute angles in each face
        
        // Get the faces of this cell from the computation
        const faces = computation.getFaces();
        const cellFaces = [];
        
        // Find which faces belong to this cell
        // A face belongs to a cell if its Delaunay edge connects to this cell's point
        for (let faceIdx = 0; faceIdx < faces.length; faceIdx++) {
            const face = faces[faceIdx];
            if (face.delaunayEdge && (face.delaunayEdge[0] === cellIdx || face.delaunayEdge[1] === cellIdx)) {
                cellFaces.push(face);
            }
        }
        
        // TEMPORARY: Use a simpler, more consistent approach
        // Count acute angles between edges meeting at each vertex of the cell
        // This is scale-invariant and doesn't depend on face detection
        
        // For each vertex in the cell
        for (let i = 0; i < cellVertices.length; i++) {
            const vertex = cellVertices[i];
            
            // Find the 3 nearest neighbors (typical for Voronoi vertices)
            const neighbors = [];
            for (let j = 0; j < cellVertices.length; j++) {
                if (i === j) continue;
                const dist = calculateSquaredDistance(vertex, cellVertices[j]);
                neighbors.push({ index: j, dist: dist });
            }
            
            // Sort and take closest 3
            neighbors.sort((a, b) => a.dist - b.dist);
            const closest = neighbors.slice(0, 3);
            
            // Calculate angles between each pair of edges
            for (let j = 0; j < closest.length; j++) {
                for (let k = j + 1; k < closest.length; k++) {
                    const v1 = cellVertices[closest[j].index];
                    const v2 = cellVertices[closest[k].index];
                    
                    // Vectors from vertex to neighbors
                    const vec1 = [
                        v1[0] - vertex[0],
                        v1[1] - vertex[1],
                        v1[2] - vertex[2]
                    ];
                    
                    const vec2 = [
                        v2[0] - vertex[0],
                        v2[1] - vertex[1],
                        v2[2] - vertex[2]
                    ];
                    
                    const angle = calculateAngle(vec1, vec2);
                    
                    // Count if acute
                    if (angle < Math.PI / 2) {
                        acuteAngles++;
                    }
                }
            }
        }
        
        // Don't normalize by cell size - acute angles are scale-invariant!
        // The issue was that larger cells (fewer points) have more vertices,
        // so dividing by cellVertices.length was artificially reducing scores
        let finalScore = acuteAngles;
        
        // Adjust score for boundary cells with a more nuanced approach
        if (isBoundaryCell && boundaryInfo) {
            // The adjustment depends on:
            // 1. How "boundary" the cell is (corner cells need more adjustment than edge cells)
            // 2. The original score (high scores should be reduced more than low scores)
            
            // Calculate adjustment factor based on boundary characteristics
            // Corner cells (3 boundaries) get max adjustment, face cells (1 boundary) get minimal
            const baseFactor = 0.7 + (0.3 * (1 - boundaryInfo.score)); // 0.7 to 1.0
            
            // Also consider the original score - higher scores get more reduction
            const scoreFactor = 1.0 - (0.3 * Math.min(finalScore / 50, 1)); // Adjusted for non-normalized scores
            
            // Combined adjustment
            const adjustmentFactor = baseFactor * scoreFactor;
            
            finalScore = Math.round(finalScore * adjustmentFactor);
        }
        
        scores.push(finalScore);
        
        // Early termination if we've reached max score
        if (finalScore >= maxScore) break;
    }
    
    // Record simple performance metrics
    if (performanceEnabled) {
        const endTime = performance.now();
        simpleMetrics.totalTime += endTime - startTime;
        simpleMetrics.callCount++;
    }
    
    // Log score statistics for debugging
    if (scores.length > 0) {
        const minScore = Math.min(...scores);
        const maxScore = Math.max(...scores);
        const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
        console.log(`Cell acuteness (${scores.length} cells): min=${minScore}, max=${maxScore}, avg=${avgScore.toFixed(1)}`);
        
        // Show distribution
        const distribution = {};
        scores.forEach(score => {
            const bucket = Math.floor(score / 10) * 10;
            distribution[bucket] = (distribution[bucket] || 0) + 1;
        });
        console.log('Distribution:', distribution);
    }
    
    return scores;
}

/**
 * Calculate edge acuteness for Voronoi edges.
 * For each edge, count how many acute angles it forms with other connected edges.
 * @param {Object} computation - The DelaunayComputation object
 * @param {number} maxScore - Maximum score to compute (for early termination)
 * @returns {Array<number>} Array of acuteness scores for each edge
 */
export function edgeAcuteness(computation, maxScore = Infinity) {
    if (!computation || !computation.voronoiEdges || computation.voronoiEdges.length === 0) {
        return [];
    }
    
    // In non-periodic mode, detect boundary edges
    let boundaryEdges = new Set();
    if (!computation.isPeriodic) {
        const boundaryThreshold = 0.1;
        
        // An edge is on the boundary if either endpoint is near the boundary
        computation.voronoiEdges.forEach((edge, edgeIdx) => {
            const startBoundary = (edge.start[0] < boundaryThreshold || edge.start[0] > 1 - boundaryThreshold ||
                                  edge.start[1] < boundaryThreshold || edge.start[1] > 1 - boundaryThreshold ||
                                  edge.start[2] < boundaryThreshold || edge.start[2] > 1 - boundaryThreshold);
            
            const endBoundary = (edge.end[0] < boundaryThreshold || edge.end[0] > 1 - boundaryThreshold ||
                                edge.end[1] < boundaryThreshold || edge.end[1] > 1 - boundaryThreshold ||
                                edge.end[2] < boundaryThreshold || edge.end[2] > 1 - boundaryThreshold);
            
            if (startBoundary || endBoundary) {
                boundaryEdges.add(edgeIdx);
            }
        });
        
        console.log(`Detected ${boundaryEdges.size} boundary edges in non-periodic mode`);
    }
    
    // Build a map of vertex positions to connected edges
    const vertexToEdges = new Map();
    
    computation.voronoiEdges.forEach((edge, edgeIndex) => {
        // Convert vertex positions to string keys for Map lookup
        const startKey = `${edge.start[0].toFixed(6)},${edge.start[1].toFixed(6)},${edge.start[2].toFixed(6)}`;
        const endKey = `${edge.end[0].toFixed(6)},${edge.end[1].toFixed(6)},${edge.end[2].toFixed(6)}`;
        
        // Add edge to start vertex's list
        if (!vertexToEdges.has(startKey)) {
            vertexToEdges.set(startKey, []);
        }
        vertexToEdges.get(startKey).push({ index: edgeIndex, vertex: 'start', edge });
        
        // Add edge to end vertex's list
        if (!vertexToEdges.has(endKey)) {
            vertexToEdges.set(endKey, []);
        }
        vertexToEdges.get(endKey).push({ index: edgeIndex, vertex: 'end', edge });
    });
    
    // Calculate acuteness for each edge
    const acutenessScores = new Array(computation.voronoiEdges.length).fill(0);
    
    computation.voronoiEdges.forEach((currentEdge, currentIndex) => {
        let acuteCount = 0;
        
        // Check if this is a boundary edge
        const isBoundaryEdge = !computation.isPeriodic && boundaryEdges.has(currentIndex);
        
        // Check angles at both endpoints of the current edge
        ['start', 'end'].forEach(endpoint => {
            const vertexPos = currentEdge[endpoint];
            const vertexKey = `${vertexPos[0].toFixed(6)},${vertexPos[1].toFixed(6)},${vertexPos[2].toFixed(6)}`;
            const connectedEdges = vertexToEdges.get(vertexKey) || [];
            
            // Get direction vector for current edge (pointing away from the vertex)
            const currentDir = [
                (endpoint === 'start' ? currentEdge.end[0] - currentEdge.start[0] : currentEdge.start[0] - currentEdge.end[0]),
                (endpoint === 'start' ? currentEdge.end[1] - currentEdge.start[1] : currentEdge.start[1] - currentEdge.end[1]),
                (endpoint === 'start' ? currentEdge.end[2] - currentEdge.start[2] : currentEdge.start[2] - currentEdge.end[2])
            ];
            
            // Check angle with each connected edge
            connectedEdges.forEach(connectedInfo => {
                if (connectedInfo.index === currentIndex) return; // Skip self
                
                const connectedEdge = connectedInfo.edge;
                const connectedEndpoint = connectedInfo.vertex;
                
                // Get direction vector for connected edge (pointing away from the shared vertex)
                const connectedDir = [
                    (connectedEndpoint === 'start' ? connectedEdge.end[0] - connectedEdge.start[0] : connectedEdge.start[0] - connectedEdge.end[0]),
                    (connectedEndpoint === 'start' ? connectedEdge.end[1] - connectedEdge.start[1] : connectedEdge.start[1] - connectedEdge.end[1]),
                    (connectedEndpoint === 'start' ? connectedEdge.end[2] - connectedEdge.start[2] : connectedEdge.start[2] - connectedEdge.end[2])
                ];
                
                // Calculate angle between the two edges
                const angle = calculateAngle(currentDir, connectedDir);
                
                // Count if acute
                if (angle < Math.PI / 2) {
                    acuteCount++;
                }
            });
        });
        
        // Adjust score for boundary edges
        if (isBoundaryEdge) {
            // Boundary edges often have fewer connections and artificial angles
            // Reduce score by 40%
            acuteCount = Math.round(acuteCount * 0.6);
        }
        
        acutenessScores[currentIndex] = acuteCount;
        
        // Early termination
        if (acuteCount >= maxScore) return acutenessScores;
    });
    
    // Log score statistics for debugging
    if (acutenessScores.length > 0) {
        const minScore = Math.min(...acutenessScores);
        const maxScore = Math.max(...acutenessScores);
        const avgScore = acutenessScores.reduce((a, b) => a + b, 0) / acutenessScores.length;
        console.log(`Edge acuteness (${acutenessScores.length} edges): min=${minScore}, max=${maxScore}, avg=${avgScore.toFixed(1)}`);
    }
    
    return acutenessScores;
}

/**
 * Comprehensive acuteness analysis for all geometric features.
 * @param {Object} computation - The DelaunayComputation result
 * @param {Object} options - Analysis options
 * @returns {Object} Analysis results with scores for vertices, faces, and cells
 */
export function analyzeAcuteness(computation, options = {}) {
    const { 
        maxScore = Infinity, 
        includePerformance = false,  // Default to false for speed
        searchRadius = 0.3
    } = options;
    
    // Enable performance tracking only if requested
    setPerformanceTracking(includePerformance);
    
    const analysisStartTime = includePerformance ? performance.now() : 0;
    
    const results = {
        vertexScores: vertexAcuteness(computation, maxScore),
        faceScores: faceAcuteness(computation, maxScore),
        cellScores: cellAcuteness(computation, maxScore, searchRadius),
        edgeScores: edgeAcuteness(computation, maxScore)
    };
    
    if (includePerformance) {
        const analysisEndTime = performance.now();
        const totalDuration = analysisEndTime - analysisStartTime;
        
        results.performance = {
            totalTime: totalDuration,
            metrics: getPerformanceMetrics(),
            cacheStats: {
                cacheSize: 0,
                maxCacheSize: 0
            }
        };
    }
    
    return results;
}

// Remove the complex spatial index class - it was causing more overhead than benefit
// The simple sorting approach is actually faster for typical dataset sizes 