/**
 * GrowthSystem.js
 * 
 * Implements cell growth based on acuteness scores
 * Cells with more acute angles expand by moving their generator points
 * away from the cell centroid
 */

export class GrowthSystem {
    constructor(config = {}) {
        // Growth configuration
        this.config = {
            // Base growth rate multiplier
            k: config.k || 0.001,
            // Whether to normalize growth rates
            normalize: config.normalize !== undefined ? config.normalize : true,
            // Momentum/damping factor (0-1)
            damping: config.damping || 0.7,
            // Maximum displacement per step
            maxDelta: config.maxDelta || 0.02,
            // Time step multiplier (if > 0)
            dt: config.dt || 0,
            // Threshold for grow/shrink decision
            threshold: config.threshold || 5,
            // Power factor for non-linear growth (1 = linear, 2 = quadratic)
            growthPower: config.growthPower || 1.5,
            // Growth mode: 'more_grow_only', 'more_grow_both', 'more_shrink_only', 'more_shrink_both'
            mode: config.mode || 'more_grow_both'
        };
        
        // Previous deltas for momentum
        this.previousDeltas = new Map();
        
        // Statistics
        this.stats = {
            totalDisplacement: 0,
            maxDisplacement: 0,
            activePoints: 0,
            growingPoints: 0,
            shrinkingPoints: 0
        };
    }
    
    /**
     * Calculate the centroid of a Voronoi cell
     * @param {Array} cellVertices - Array of [x,y,z] vertices
     * @returns {Array} [x,y,z] centroid coordinates
     */
    calculateCentroid(cellVertices) {
        if (!cellVertices || cellVertices.length === 0) {
            return [0, 0, 0];
        }
        
        let sumX = 0, sumY = 0, sumZ = 0;
        for (const vertex of cellVertices) {
            sumX += vertex[0];
            sumY += vertex[1];
            sumZ += vertex[2];
        }
        
        const n = cellVertices.length;
        return [sumX / n, sumY / n, sumZ / n];
    }
    
    /**
     * Apply growth to points based on acuteness scores
     * @param {Array} points - Current generator points [[x,y,z], ...]
     * @param {Object} computation - DelaunayComputation instance
     * @param {Object} analysisResults - Results from acuteness analysis
     * @returns {Array} New points after growth
     */
    applyGrowth(points, computation, analysisResults) {
        if (!analysisResults || !analysisResults.cellScores) {
            console.warn('No analysis results available for growth');
            return points;
        }
        
        const cells = computation.getCells();
        const cellScores = analysisResults.cellScores;
        
        // Reset stats
        this.stats = {
            totalDisplacement: 0,
            maxDisplacement: 0,
            activePoints: 0,
            growingPoints: 0,
            shrinkingPoints: 0
        };
        
        // Calculate raw flux (stress) for each point
        const rawFlux = new Array(points.length).fill(0);
        let maxFlux = 0;
        
        for (let i = 0; i < points.length; i++) {
            const score = cellScores[i] || 0;
            
            // Determine if this cell should grow or shrink based on mode and threshold
            let shouldGrow = false;
            let fluxMagnitude = 0;
            
            switch (this.config.mode) {
                case 'more_grow_only':
                    // Only cells with more acute angles than threshold grow
                    if (score > this.config.threshold) {
                        shouldGrow = true;
                        fluxMagnitude = score - this.config.threshold;
                    }
                    break;
                    
                case 'more_grow_both':
                    // More acute = grow, less acute = shrink
                    if (score > this.config.threshold) {
                        shouldGrow = true;
                        fluxMagnitude = score - this.config.threshold;
                    } else if (score < this.config.threshold) {
                        shouldGrow = false;
                        fluxMagnitude = this.config.threshold - score;
                    }
                    break;
                    
                case 'more_shrink_only':
                    // Only cells with more acute angles than threshold shrink
                    if (score > this.config.threshold) {
                        shouldGrow = false;
                        fluxMagnitude = score - this.config.threshold;
                    }
                    break;
                    
                case 'more_shrink_both':
                    // More acute = shrink, less acute = grow
                    if (score > this.config.threshold) {
                        shouldGrow = false;
                        fluxMagnitude = score - this.config.threshold;
                    } else if (score < this.config.threshold) {
                        shouldGrow = true;
                        fluxMagnitude = this.config.threshold - score;
                    }
                    break;
                    
                default:
                    // Default to more_grow_both
                    if (score > this.config.threshold) {
                        shouldGrow = true;
                        fluxMagnitude = score - this.config.threshold;
                    } else if (score < this.config.threshold) {
                        shouldGrow = false;
                        fluxMagnitude = this.config.threshold - score;
                    }
            }
            
            // Apply non-linear growth function
            if (fluxMagnitude > 0) {
                rawFlux[i] = Math.pow(fluxMagnitude, this.config.growthPower) * (shouldGrow ? 1 : -1);
                maxFlux = Math.max(maxFlux, Math.abs(rawFlux[i]));
            }
        }
        
        // Normalize flux if requested
        if (this.config.normalize && maxFlux > 0) {
            for (let i = 0; i < rawFlux.length; i++) {
                // Preserve sign while normalizing magnitude
                rawFlux[i] /= maxFlux;
            }
        }
        
        // Calculate new positions
        const newPoints = [];
        
        for (let i = 0; i < points.length; i++) {
            const point = points[i];
            const cellVertices = cells.get(i);
            
            // If no cell vertices or no flux, keep point unchanged
            if (!cellVertices || cellVertices.length === 0 || rawFlux[i] === 0) {
                newPoints.push([...point]);
                continue;
            }
            
            // Calculate cell centroid
            const centroid = this.calculateCentroid(cellVertices);
            
            // Calculate growth direction 
            // For positive flux: from centroid to point (growth)
            // For negative flux: from point to centroid (shrink)
            const dirX = point[0] - centroid[0];
            const dirY = point[1] - centroid[1];
            const dirZ = point[2] - centroid[2];
            
            // Handle periodic boundaries
            const adjustedDir = this.adjustDirectionForPeriodic(dirX, dirY, dirZ);
            
            // Normalize direction
            const length = Math.sqrt(
                adjustedDir[0] ** 2 + 
                adjustedDir[1] ** 2 + 
                adjustedDir[2] ** 2
            );
            
            if (length < 1e-6) {
                // Point is at centroid, use small random direction
                adjustedDir[0] = (Math.random() - 0.5) * 0.01;
                adjustedDir[1] = (Math.random() - 0.5) * 0.01;
                adjustedDir[2] = (Math.random() - 0.5) * 0.01;
            } else {
                adjustedDir[0] /= length;
                adjustedDir[1] /= length;
                adjustedDir[2] /= length;
            }
            
            // Calculate displacement magnitude
            let delta = this.config.k * rawFlux[i];
            
            // Apply damping with previous delta
            const prevDelta = this.previousDeltas.get(i) || 0;
            delta = this.config.damping * prevDelta + (1 - this.config.damping) * delta;
            
            // Clamp to maximum delta
            delta = Math.min(delta, this.config.maxDelta);
            
            // Apply time step if configured
            if (this.config.dt > 0) {
                delta *= this.config.dt;
            }
            
            // Store for next iteration
            this.previousDeltas.set(i, delta);
            
            // Calculate new position
            const newX = point[0] + adjustedDir[0] * delta;
            const newY = point[1] + adjustedDir[1] * delta;
            const newZ = point[2] + adjustedDir[2] * delta;
            
            // Wrap coordinates for periodic mode
            const wrappedPos = this.wrapCoordinates(newX, newY, newZ);
            newPoints.push(wrappedPos);
            
            // Update statistics
            if (Math.abs(delta) > 0) {
                this.stats.activePoints++;
                this.stats.totalDisplacement += Math.abs(delta);
                this.stats.maxDisplacement = Math.max(this.stats.maxDisplacement, Math.abs(delta));
                
                if (rawFlux[i] > 0) {
                    this.stats.growingPoints++;
                } else if (rawFlux[i] < 0) {
                    this.stats.shrinkingPoints++;
                }
            }
        }
        
        return newPoints;
    }
    
    /**
     * Adjust direction vector for periodic boundaries
     * @private
     */
    adjustDirectionForPeriodic(dx, dy, dz) {
        // Apply minimum image convention
        const adjusted = [dx, dy, dz];
        
        if (dx > 0.5) adjusted[0] -= 1.0;
        else if (dx < -0.5) adjusted[0] += 1.0;
        
        if (dy > 0.5) adjusted[1] -= 1.0;
        else if (dy < -0.5) adjusted[1] += 1.0;
        
        if (dz > 0.5) adjusted[2] -= 1.0;
        else if (dz < -0.5) adjusted[2] += 1.0;
        
        return adjusted;
    }
    
    /**
     * Wrap coordinates to [0,1] for periodic boundaries
     * @private
     */
    wrapCoordinates(x, y, z) {
        const wrapped = [x, y, z];
        
        // Wrap each coordinate to [0,1]
        for (let i = 0; i < 3; i++) {
            wrapped[i] = wrapped[i] % 1;
            if (wrapped[i] < 0) wrapped[i] += 1;
        }
        
        return wrapped;
    }
    
    /**
     * Get current growth statistics
     */
    getStats() {
        return {
            ...this.stats,
            averageDisplacement: this.stats.activePoints > 0 ? 
                this.stats.totalDisplacement / this.stats.activePoints : 0
        };
    }
    
    /**
     * Reset the growth system
     */
    reset() {
        this.previousDeltas.clear();
        this.stats = {
            totalDisplacement: 0,
            maxDisplacement: 0,
            activePoints: 0,
            growingPoints: 0,
            shrinkingPoints: 0
        };
    }
    
    /**
     * Update configuration
     */
    updateConfig(newConfig) {
        Object.assign(this.config, newConfig);
    }
} 