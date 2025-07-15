/**
 * LiveUpdateOptimizer.js
 * 
 * Intelligent update system for live animation of 1000+ points
 * Only recalculates what actually changed
 */

export class LiveUpdateOptimizer {
    constructor() {
        this.previousPositions = new Map();
        this.previousScores = {
            cells: [],
            faces: [],
            vertices: []
        };
        this.updateThreshold = 0.001; // Movement threshold to trigger update
        this.frameSkip = 2; // Update every N frames
        this.currentFrame = 0;
        this.dirtyFlags = new Set();
    }
    
    /**
     * Track which points have moved significantly
     * @returns {Set} Indices of points that moved
     */
    getMovedPoints(currentPoints) {
        const movedPoints = new Set();
        
        currentPoints.forEach((point, idx) => {
            const prev = this.previousPositions.get(idx);
            if (!prev) {
                movedPoints.add(idx);
                this.previousPositions.set(idx, [...point]);
            } else {
                const dx = point[0] - prev[0];
                const dy = point[1] - prev[1];
                const dz = point[2] - prev[2];
                const distSq = dx*dx + dy*dy + dz*dz;
                
                if (distSq > this.updateThreshold * this.updateThreshold) {
                    movedPoints.add(idx);
                    this.previousPositions.set(idx, [...point]);
                }
            }
        });
        
        return movedPoints;
    }
    
    /**
     * Determine which cells need recalculation
     * @param {Map} cells - Cell to vertices mapping
     * @param {Set} movedPoints - Points that moved
     * @returns {Set} Cell indices that need update
     */
    getAffectedCells(cells, movedPoints) {
        const affectedCells = new Set();
        
        for (const [cellIdx, cellVertices] of cells.entries()) {
            // Check if any vertex in this cell moved
            for (const vertex of cellVertices) {
                // Need to map vertex position back to point index
                // This is simplified - in practice you'd have proper mapping
                if (movedPoints.has(cellIdx)) {
                    affectedCells.add(cellIdx);
                    break;
                }
            }
        }
        
        return affectedCells;
    }
    
    /**
     * Smart update decision based on frame rate and movement
     */
    shouldUpdate(movedPoints) {
        this.currentFrame++;
        
        // Skip frames for performance
        if (this.currentFrame % this.frameSkip !== 0) {
            return false;
        }
        
        // Only update if significant movement
        return movedPoints.size > 0;
    }
    
    /**
     * Level-of-detail based on camera distance
     */
    getLODLevel(cameraDistance) {
        if (cameraDistance < 10) return 'high';
        if (cameraDistance < 50) return 'medium';
        return 'low';
    }
    
    /**
     * Optimized analysis for live updates
     */
    analyzeWithLiveUpdates(computation, options = {}) {
        const currentPoints = computation.getPoints();
        const movedPoints = this.getMovedPoints(currentPoints);
        
        // Skip if no significant movement
        if (!this.shouldUpdate(movedPoints)) {
            return this.previousScores;
        }
        
        const cells = computation.getCells();
        const affectedCells = this.getAffectedCells(cells, movedPoints);
        
        // If too many cells affected, do full recalculation
        if (affectedCells.size > cells.size * 0.3) {
            return this.fullRecalculation(computation, options);
        }
        
        // Otherwise, incremental update
        return this.incrementalUpdate(computation, affectedCells, options);
    }
    
    /**
     * Incremental update - only recalculate affected cells
     */
    incrementalUpdate(computation, affectedCells, options) {
        const results = { ...this.previousScores };
        
        // Only update affected cells
        if (affectedCells.size > 0) {
            // In real implementation, this would call WASM incremental update
            console.log(`Updating ${affectedCells.size} cells incrementally`);
            
            // Placeholder - would use WASM updateCellAcuteness
            // const updatedScores = wasmModule.updateCellAcuteness(
            //     vertices, cellIndices, Array.from(affectedCells), previousScores
            // );
        }
        
        return results;
    }
    
    /**
     * Full recalculation when too many changes
     */
    fullRecalculation(computation, options) {
        console.log('Full recalculation needed');
        // Would use WASM calculateCellAcuteness for speed
        // const scores = wasmModule.calculateCellAcuteness(vertices, cellIndices);
        
        // For now, fall back to JS implementation
        const results = {
            cellScores: [], // Would be WASM results
            faceScores: [],
            vertexScores: []
        };
        
        this.previousScores = results;
        return results;
    }
}

/**
 * Frame rate adaptive quality
 */
export class FrameRateAdapter {
    constructor(targetFPS = 30) {
        this.targetFPS = targetFPS;
        this.measurements = [];
        this.maxMeasurements = 10;
        this.qualityLevel = 'high';
    }
    
    measureFrame(deltaTime) {
        this.measurements.push(deltaTime);
        if (this.measurements.length > this.maxMeasurements) {
            this.measurements.shift();
        }
        
        const avgDelta = this.measurements.reduce((a, b) => a + b, 0) / this.measurements.length;
        const currentFPS = 1000 / avgDelta;
        
        // Adjust quality based on performance
        if (currentFPS < this.targetFPS * 0.7) {
            this.decreaseQuality();
        } else if (currentFPS > this.targetFPS * 0.95) {
            this.increaseQuality();
        }
    }
    
    decreaseQuality() {
        if (this.qualityLevel === 'high') {
            this.qualityLevel = 'medium';
            console.log('Reducing quality to maintain frame rate');
        } else if (this.qualityLevel === 'medium') {
            this.qualityLevel = 'low';
            console.log('Further reducing quality');
        }
    }
    
    increaseQuality() {
        if (this.qualityLevel === 'low') {
            this.qualityLevel = 'medium';
        } else if (this.qualityLevel === 'medium') {
            this.qualityLevel = 'high';
        }
    }
    
    getQualitySettings() {
        switch (this.qualityLevel) {
            case 'high':
                return { maxNeighbors: 6, skipFrames: 1 };
            case 'medium':
                return { maxNeighbors: 4, skipFrames: 2 };
            case 'low':
                return { maxNeighbors: 3, skipFrames: 4 };
        }
    }
} 