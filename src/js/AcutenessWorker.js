/**
 * AcutenessWorker.js
 * 
 * Web Worker for parallel acuteness computation
 * Offloads heavy angle calculations from the main thread
 */

// Import the calculation functions (we'll need to inline them since workers can't import modules easily)

/**
 * Calculate squared distance between two points (faster than actual distance)
 * @param {Array} p1 - First point [x, y, z]
 * @param {Array} p2 - Second point [x, y, z]
 * @returns {number} Squared distance
 */
function calculateSquaredDistance(p1, p2) {
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const dz = p2[2] - p1[2];
    return dx * dx + dy * dy + dz * dz;
}

/**
 * Calculate the angle between two vectors in radians
 * @param {Array} vec1 - First vector [x, y, z]
 * @param {Array} vec2 - Second vector [x, y, z]
 * @returns {number} Angle in radians
 */
function calculateAngle(vec1, vec2) {
    // Calculate dot product
    const dot = vec1[0] * vec2[0] + vec1[1] * vec2[1] + vec1[2] * vec2[2];
    
    // Calculate squared magnitudes (avoid sqrt until necessary)
    const magSq1 = vec1[0] * vec1[0] + vec1[1] * vec1[1] + vec1[2] * vec1[2];
    const magSq2 = vec2[0] * vec2[0] + vec2[1] * vec2[1] + vec2[2] * vec2[2];
    
    // Avoid division by zero
    if (magSq1 === 0 || magSq2 === 0) {
        return 0;
    }
    
    // Calculate angle using dot product formula
    const cosTheta = Math.max(-1, Math.min(1, dot / Math.sqrt(magSq1 * magSq2)));
    return Math.acos(cosTheta);
}

/**
 * Process a chunk of cells for acuteness analysis
 * @param {Array} cellChunk - Array of cell data {cellIdx, cellVertices}
 * @param {number} maxScore - Early termination threshold
 * @param {number} searchRadius - Radius for spatial neighbor search
 * @returns {Object} Results object with scores and metrics
 */
function processCellChunk(cellChunk, maxScore, searchRadius) {
    const scores = [];
    let totalAngleCalculations = 0;
    const startTime = performance.now();
    
    for (const {cellIdx, cellVertices} of cellChunk) {
        if (cellVertices.length < 4) {
            scores.push({cellIdx, score: 0});
            continue;
        }
        
        let acuteAngles = 0;
        
        // For each vertex in the cell, find angles between adjacent edges
        for (let i = 0; i < cellVertices.length; i++) {
            const center = cellVertices[i];
            
            // Find the closest neighbors to form meaningful edges
            const otherVertices = cellVertices.filter((_, idx) => idx !== i);
            
            // Sort by distance to get closest neighbors
            otherVertices.sort((a, b) => {
                const distSqA = calculateSquaredDistance(center, a);
                const distSqB = calculateSquaredDistance(center, b);
                return distSqA - distSqB;
            });
            
            // Take up to 6 closest neighbors to avoid overcounting
            const maxNeighbors = Math.min(6, otherVertices.length);
            
            // Calculate angles between adjacent neighbor pairs
            for (let j = 0; j < maxNeighbors; j++) {
                for (let k = j + 1; k < maxNeighbors; k++) {
                    const v1 = otherVertices[j];
                    const v2 = otherVertices[k];
                    
                    // Calculate vectors from center to neighbors
                    const vec1 = [
                        v1[0] - center[0],
                        v1[1] - center[1],
                        v1[2] - center[2]
                    ];
                    
                    const vec2 = [
                        v2[0] - center[0],
                        v2[1] - center[1],
                        v2[2] - center[2]
                    ];
                    
                    // Calculate angle between vectors
                    const angle = calculateAngle(vec1, vec2);
                    totalAngleCalculations++;
                    
                    // Count if acute (< 90 degrees)
                    if (angle < Math.PI / 2) {
                        acuteAngles++;
                    }
                }
            }
        }
        
        // Normalize by cell size to get a reasonable score
        const normalizedScore = Math.round(acuteAngles / cellVertices.length);
        scores.push({cellIdx, score: normalizedScore});
        
        // Early termination if we've reached max score
        if (normalizedScore >= maxScore) {
            break;
        }
    }
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    return {
        scores,
        metrics: {
            duration,
            totalAngleCalculations,
            cellsProcessed: cellChunk.length,
            efficiency: totalAngleCalculations / duration
        }
    };
}

/**
 * Process a chunk of faces for acuteness analysis
 * @param {Array} faceChunk - Array of face data
 * @param {number} maxScore - Early termination threshold
 * @returns {Object} Results object with scores and metrics
 */
function processFaceChunk(faceChunk, maxScore) {
    const scores = [];
    let totalAngleCalculations = 0;
    const startTime = performance.now();
    
    for (let i = 0; i < faceChunk.length; i++) {
        const face = faceChunk[i];
        const vertices = face.voronoiVertices;
        
        if (vertices.length < 3) {
            scores.push({faceIdx: i, score: 0});
            continue;
        }
        
        let acuteAngles = 0;
        
        // Calculate interior angles of the polygon
        for (let j = 0; j < vertices.length; j++) {
            const prev = vertices[(j - 1 + vertices.length) % vertices.length];
            const curr = vertices[j];
            const next = vertices[(j + 1) % vertices.length];
            
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
            totalAngleCalculations++;
            
            // Count if the angle is acute (< 90 degrees)
            if (angle < Math.PI / 2) {
                acuteAngles++;
            }
        }
        
        scores.push({faceIdx: i, score: acuteAngles});
        
        // Early termination if we've reached max score
        if (acuteAngles >= maxScore) {
            break;
        }
    }
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    return {
        scores,
        metrics: {
            duration,
            totalAngleCalculations,
            facesProcessed: faceChunk.length,
            efficiency: totalAngleCalculations / duration
        }
    };
}

/**
 * Process a chunk of tetrahedra for vertex acuteness analysis
 * @param {Array} tetraChunk - Array of tetrahedra data
 * @param {Array} points - Array of input points
 * @param {number} maxScore - Early termination threshold
 * @returns {Object} Results object with scores and metrics
 */
function processTetraChunk(tetraChunk, points, maxScore) {
    const scores = [];
    let totalAngleCalculations = 0;
    const startTime = performance.now();
    
    for (let i = 0; i < tetraChunk.length; i++) {
        const tet = tetraChunk[i];
        const vertices = tet.map(idx => points[idx]);
        
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
            totalAngleCalculations += 3;
            
            // Count acute angles (< 90 degrees)
            const acuteCount = angles.filter(angle => angle < Math.PI / 2).length;
            acuteAngles += acuteCount;
        }
        
        scores.push({tetraIdx: i, score: acuteAngles});
        
        // Early termination if we've reached max score
        if (acuteAngles >= maxScore) {
            break;
        }
    }
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    return {
        scores,
        metrics: {
            duration,
            totalAngleCalculations,
            tetraProcessed: tetraChunk.length,
            efficiency: totalAngleCalculations / duration
        }
    };
}

// Worker message handler
self.onmessage = function(e) {
    const { type, data } = e.data;
    
    try {
        let result;
        
        switch (type) {
            case 'CELL_ACUTENESS':
                result = processCellChunk(data.cellChunk, data.maxScore, data.searchRadius);
                break;
                
            case 'FACE_ACUTENESS':
                result = processFaceChunk(data.faceChunk, data.maxScore);
                break;
                
            case 'VERTEX_ACUTENESS':
                result = processTetraChunk(data.tetraChunk, data.points, data.maxScore);
                break;
                
            default:
                throw new Error(`Unknown worker task type: ${type}`);
        }
        
        // Send result back to main thread
        self.postMessage({
            type: 'SUCCESS',
            taskType: type,
            result
        });
        
    } catch (error) {
        // Send error back to main thread
        self.postMessage({
            type: 'ERROR',
            taskType: type,
            error: error.message
        });
    }
}; 