/**
 * DelaunayComputation.js
 * 
 * A high-level JavaScript class that encapsulates the complexity of WASM interaction
 * and provides a clean API for Delaunay triangulation and Voronoi diagram computation.
 */

export class DelaunayComputation {
    constructor(points, isPeriodic = true) {
        // Convert points to flat array if needed
        if (Array.isArray(points) && Array.isArray(points[0])) {
            // Points provided as [[x,y,z], [x,y,z], ...]
            this.pointsArray = points;
            this.points = new Float64Array(points.flat());
        } else if (points instanceof Float64Array || points instanceof Float32Array) {
            // Points provided as flat typed array
            this.points = new Float64Array(points);
            this.pointsArray = [];
            for (let i = 0; i < this.points.length; i += 3) {
                this.pointsArray.push([
                    this.points[i],
                    this.points[i + 1],
                    this.points[i + 2]
                ]);
            }
        } else {
            // Points provided as flat array
            this.points = new Float64Array(points);
            this.pointsArray = [];
            for (let i = 0; i < this.points.length; i += 3) {
                this.pointsArray.push([
                    this.points[i],
                    this.points[i + 1],
                    this.points[i + 2]
                ]);
            }
        }
        
        this.isPeriodic = isPeriodic;
        this.numPoints = this.pointsArray.length;
        
        // Results will be stored here
        this.tetrahedra = [];
        this.voronoiEdges = [];
        this.voronoiCells = [];
        this.barycenters = [];
        
        // Simple caching for performance
        this._facesCache = null;
        this._cellsCache = null;
    }

    /**
     * Invalidate cached computations
     * @private
     */
    _invalidateCaches() {
        this._facesCache = null;
        this._cellsCache = null;
    }

    /**
     * Main method to run the computation
     * @param {Object} wasmModule - The loaded WASM module
     * @returns {DelaunayComputation} - Returns this for chaining
     */
    async compute(wasmModule) {
        if (!wasmModule) {
            throw new Error('WASM module not provided');
        }
        
        console.log(`Computing Delaunay triangulation for ${this.numPoints} points (${this.isPeriodic ? 'periodic' : 'non-periodic'})...`);
        
        // Clear caches since we're recomputing
        this._invalidateCaches();
        
        // Debug: Log the first few points
        console.log('First 3 points:', this.pointsArray.slice(0, 3));
        
        try {
            // Call the WASM compute_delaunay function
            console.log('Calling WASM with:', {
                pointsLength: this.points.length,
                numPoints: this.numPoints,
                isPeriodic: this.isPeriodic
            });
            
            const rawResult = wasmModule.compute_delaunay(this.points, this.numPoints, this.isPeriodic);
            
            console.log('WASM returned:', rawResult ? `${rawResult.length} tetrahedra` : 'null/undefined');
            
            if (rawResult && rawResult.length > 0) {
                // Filter and convert the raw results
                this.tetrahedra = this._filterTetrahedra(rawResult);
                console.log(`Computed ${this.tetrahedra.length} valid tetrahedra (filtered from ${rawResult.length})`);
                
                // Compute Voronoi diagram from Delaunay
                this._computeVoronoiBarycentric();
            } else {
                console.warn('No tetrahedra generated');
                this.tetrahedra = [];
                this.voronoiEdges = [];
            }
        } catch (error) {
            console.error('Error in Delaunay computation:', error);
            throw error;
        }
        
        return this; // Allow chaining
    }

    /**
     * Filter out tetrahedra with invalid vertex indices
     * @private
     */
    _filterTetrahedra(rawResult) {
        const filtered = [];
        let invalidCount = 0;
        
        for (const tet of rawResult) {
            // Check if all vertex indices are valid (non-negative and within bounds)
            const v0 = tet[0];
            const v1 = tet[1];
            const v2 = tet[2];
            const v3 = tet[3];
            
            if (v0 >= 0 && v0 < this.numPoints &&
                v1 >= 0 && v1 < this.numPoints &&
                v2 >= 0 && v2 < this.numPoints &&
                v3 >= 0 && v3 < this.numPoints) {
                // Convert to nested array format
                filtered.push([v0, v1, v2, v3]);
            } else {
                invalidCount++;
            }
        }
        
        if (invalidCount > 0) {
            console.log(`Filtered out ${invalidCount} tetrahedra with invalid vertex indices`);
        }
        
        return filtered;
    }

    /**
     * Compute Voronoi diagram using tetrahedra barycenters
     * @private
     */
    _computeVoronoiBarycentric() {
        if (this.tetrahedra.length === 0) return;

        console.log("Computing Voronoi diagram using barycenters...");

        // 1. Calculate the barycenter for each valid tetrahedron
        this.barycenters = [];
        for (let i = 0; i < this.tetrahedra.length; i++) {
            const tetraIndices = this.tetrahedra[i];
            const p0 = this.pointsArray[tetraIndices[0]];
            const p1 = this.pointsArray[tetraIndices[1]];
            const p2 = this.pointsArray[tetraIndices[2]];
            const p3 = this.pointsArray[tetraIndices[3]];

            // For periodic mode, we need to handle wrap-around when computing barycenters
            if (this.isPeriodic) {
                // Use the first point as reference
                const ref = p0;
                
                // Adjust other points to be in the same periodic image
                const adjustPoint = (p) => {
                    const adjusted = [...p];
                    for (let dim = 0; dim < 3; dim++) {
                        const diff = p[dim] - ref[dim];
                        if (diff > 0.5) adjusted[dim] -= 1.0;
                        else if (diff < -0.5) adjusted[dim] += 1.0;
                    }
                    return adjusted;
                };
                
                const p1adj = adjustPoint(p1);
                const p2adj = adjustPoint(p2);
                const p3adj = adjustPoint(p3);
                
                let centerX = (ref[0] + p1adj[0] + p2adj[0] + p3adj[0]) / 4;
                let centerY = (ref[1] + p1adj[1] + p2adj[1] + p3adj[1]) / 4;
                let centerZ = (ref[2] + p1adj[2] + p2adj[2] + p3adj[2]) / 4;
                
                // Wrap the center back into [0,1]
                while (centerX < 0) centerX += 1.0;
                while (centerX >= 1) centerX -= 1.0;
                while (centerY < 0) centerY += 1.0;
                while (centerY >= 1) centerY -= 1.0;
                while (centerZ < 0) centerZ += 1.0;
                while (centerZ >= 1) centerZ -= 1.0;
                
                this.barycenters.push([centerX, centerY, centerZ]);
            } else {
                // Non-periodic case - simple average
                const centerX = (p0[0] + p1[0] + p2[0] + p3[0]) / 4;
                const centerY = (p0[1] + p1[1] + p2[1] + p3[1]) / 4;
                const centerZ = (p0[2] + p1[2] + p2[2] + p3[2]) / 4;
                this.barycenters.push([centerX, centerY, centerZ]);
            }
        }

        // 2. Build face-to-tetra adjacency map
        const faceToTetraMap = new Map();
        for (let i = 0; i < this.tetrahedra.length; i++) {
            const tetra = this.tetrahedra[i];
            // All 4 faces of a tetrahedron
            const faces = [
                [tetra[0], tetra[1], tetra[2]],
                [tetra[0], tetra[1], tetra[3]],
                [tetra[0], tetra[2], tetra[3]],
                [tetra[1], tetra[2], tetra[3]]
            ];
            
            faces.forEach(face => {
                // Create a canonical key for the face
                const key = face.slice().sort((a, b) => a - b).join('-');
                if (!faceToTetraMap.has(key)) {
                    faceToTetraMap.set(key, []);
                }
                faceToTetraMap.get(key).push(i);
            });
        }
        
        // 3. Create Voronoi edges by connecting barycenters of adjacent tetrahedra
        this.voronoiEdges = [];
        const edgeSet = new Set(); // To avoid duplicates
        
        for (const [faceKey, tetraIndices] of faceToTetraMap.entries()) {
            if (tetraIndices.length === 2) {
                // This face is shared by exactly 2 tetrahedra
                const idx1 = tetraIndices[0];
                const idx2 = tetraIndices[1];
                
                // Create edge key to avoid duplicates
                const edgeKey = idx1 < idx2 ? `${idx1}-${idx2}` : `${idx2}-${idx1}`;
                if (!edgeSet.has(edgeKey)) {
                    edgeSet.add(edgeKey);
                    const center1 = this.barycenters[idx1];
                    const center2 = this.barycenters[idx2];
                    this.voronoiEdges.push({
                        start: center1,
                        end: center2,
                        tetraIndices: [idx1, idx2],
                        isPeriodic: this._isPeriodicEdge(center1, center2)
                    });
                }
            }
        }
        
        console.log(`Computed ${this.voronoiEdges.length} Voronoi edges.`);
        
        // ACUTENESS ANALYSIS: Log data structure exploration
        console.log('=== ACUTENESS ANALYSIS DATA STRUCTURE EXPLORATION ===');
        console.log('Available data structures:');
        console.log('- getPoints():', this.getPoints());
        console.log('- getVertices():', this.getVertices());
        console.log('- getCells():', this.getCells());
        console.log('- getFaces():', this.getFaces());
        console.log('- getDelaunayTetrahedra():', this.getDelaunayTetrahedra());
        console.log('- First 3 tetrahedra:', this.tetrahedra.slice(0, 3));
        console.log('- First 3 barycenters:', this.barycenters.slice(0, 3));
        console.log('- First 3 voronoi edges:', this.voronoiEdges.slice(0, 3));
        console.log('==================================================');
    }

    /**
     * Check if an edge crosses periodic boundaries
     * @private
     */
    _isPeriodicEdge(p1, p2) {
        if (!this.isPeriodic) return false;
        
        const dx = Math.abs(p1[0] - p2[0]);
        const dy = Math.abs(p1[1] - p2[1]);
        const dz = Math.abs(p1[2] - p2[2]);
        
        // If any dimension has a distance > 0.5, it crosses the periodic boundary
        return dx > 0.5 || dy > 0.5 || dz > 0.5;
    }

    /**
     * Get the minimum image distance between two points in periodic space
     */
    getPeriodicDistance(p1, p2) {
        if (!this.isPeriodic) {
            const dx = p2[0] - p1[0];
            const dy = p2[1] - p1[1];
            const dz = p2[2] - p1[2];
            return Math.sqrt(dx*dx + dy*dy + dz*dz);
        }
        
        let dx = p2[0] - p1[0];
        let dy = p2[1] - p1[1];
        let dz = p2[2] - p1[2];
        
        // Apply periodic boundary conditions
        if (dx > 0.5) dx -= 1.0;
        else if (dx < -0.5) dx += 1.0;
        
        if (dy > 0.5) dy -= 1.0;
        else if (dy < -0.5) dy += 1.0;
        
        if (dz > 0.5) dz -= 1.0;
        else if (dz < -0.5) dz += 1.0;
        
        return Math.sqrt(dx*dx + dy*dy + dz*dz);
    }

    /**
     * Get statistics about the computation
     */
    getStats() {
        return {
            numPoints: this.numPoints,
            numTetrahedra: this.tetrahedra.length,
            numVoronoiEdges: this.voronoiEdges.length,
            isPeriodic: this.isPeriodic
        };
    }

    /**
     * Get the input points
     */
    getPoints() {
        return this.pointsArray;
    }

    /**
     * Get the Voronoi vertices (barycenter of tetrahedra)
     */
    getVertices() {
        return this.barycenters;
    }

    /**
     * Get the Voronoi cells (map from original point to its Voronoi cell vertices) - CACHED
     */
    getCells() {
        // Return cached result if available
        if (this._cellsCache) {
            return this._cellsCache;
        }
        
        const cells = new Map();
        
        // Map each original vertex to the barycenters of tetrahedra that contain it
        this.tetrahedra.forEach((tet, index) => {
            const barycenter = this.barycenters[index];
            if (!barycenter) return;

            tet.forEach(vertexIndex => {
                if (!cells.has(vertexIndex)) {
                    cells.set(vertexIndex, []);
                }
                cells.get(vertexIndex).push(barycenter);
            });
        });
        
        // Cache the result
        this._cellsCache = cells;
        return cells;
    }

    /**
     * Build edge-to-tetrahedra mapping (simple version)
     * @private
     */
    _getEdgeToTetraMap() {
        const edgeToTetraMap = new Map();
        
        // For each tetrahedron, record which input point pairs share edges
        for (let i = 0; i < this.tetrahedra.length; i++) {
            const tetra = this.tetrahedra[i];
            
            // All edges of the tetrahedron
            const edges = [
                [tetra[0], tetra[1]],
                [tetra[0], tetra[2]],
                [tetra[0], tetra[3]],
                [tetra[1], tetra[2]],
                [tetra[1], tetra[3]],
                [tetra[2], tetra[3]]
            ];
            
            edges.forEach(edge => {
                // Create a canonical key for the edge
                const key = edge[0] < edge[1] ? `${edge[0]}-${edge[1]}` : `${edge[1]}-${edge[0]}`;
                if (!edgeToTetraMap.has(key)) {
                    edgeToTetraMap.set(key, []);
                }
                edgeToTetraMap.get(key).push(i);
            });
        }
        
        return edgeToTetraMap;
    }

    /**
     * Get the Voronoi faces (polygons formed by adjacent cells) - CACHED
     */
    getFaces() {
        // Return cached result if available
        if (this._facesCache) {
            return this._facesCache;
        }
        
        const faces = [];
        
        // Build edge-to-tetrahedra mapping
        const edgeToTetraMap = this._getEdgeToTetraMap();
        
        // For each pair of input points that share tetrahedra, create a Voronoi face
        const processedPairs = new Set();
        
        for (const [edgeKey, tetraIndices] of edgeToTetraMap.entries()) {
            if (tetraIndices.length < 2) continue;
            
            const [p1, p2] = edgeKey.split('-').map(Number);
            const pairKey = `${p1}-${p2}`;
            
            if (processedPairs.has(pairKey)) continue;
            processedPairs.add(pairKey);
            
            // Collect all Voronoi vertices (barycenters) for tetrahedra containing both p1 and p2
            const voronoiVertices = [];
            const usedTetraIndices = new Set();
            
            for (const tetraIdx of tetraIndices) {
                if (usedTetraIndices.has(tetraIdx)) continue;
                
                const tetra = this.tetrahedra[tetraIdx];
                // Check if this tetrahedron contains both p1 and p2
                if (tetra.includes(p1) && tetra.includes(p2)) {
                    voronoiVertices.push(this.barycenters[tetraIdx]);
                    usedTetraIndices.add(tetraIdx);
                }
            }
            
            // We need at least 3 vertices to form a face
            if (voronoiVertices.length >= 3) {
                // Apply MIC correction for periodic mode
                let correctedVertices = voronoiVertices;
                if (this.isPeriodic && voronoiVertices.length > 0) {
                    // Use first vertex as reference for MIC
                    const reference = voronoiVertices[0];
                    correctedVertices = voronoiVertices.map((vertex, index) => {
                        if (index === 0) return vertex;
                        
                        // Apply MIC to bring vertex to same periodic image as reference
                        const corrected = [...vertex];
                        for (let i = 0; i < 3; i++) {
                            const delta = vertex[i] - reference[i];
                            // If distance > 0.5, we're crossing a periodic boundary
                            if (delta > 0.5) {
                                corrected[i] -= 1.0;
                            } else if (delta < -0.5) {
                                corrected[i] += 1.0;
                            }
                        }
                        return corrected;
                    });
                }
                
                // Sort vertices to form a proper polygon (by angle around centroid)
                const centroid = correctedVertices.reduce((acc, v) => {
                    return [acc[0] + v[0]/correctedVertices.length, 
                            acc[1] + v[1]/correctedVertices.length, 
                            acc[2] + v[2]/correctedVertices.length];
                }, [0, 0, 0]);
                
                // Project vertices onto a plane and sort by angle
                const sortedVertices = this._sortVerticesByAngle(correctedVertices, centroid);
                
                faces.push({
                    delaunayEdge: [p1, p2],
                    voronoiVertices: sortedVertices,
                    tetraIndices: Array.from(usedTetraIndices)
                });
            }
        }
        
        console.log(`Generated ${faces.length} Voronoi faces with 3+ vertices`);
        
        // Cache the result
        this._facesCache = faces;
        return faces;
    }
    
    /**
     * Sort vertices by angle around a centroid to form a proper polygon
     * @private
     */
    _sortVerticesByAngle(vertices, centroid) {
        // Find two orthogonal vectors in the plane of the vertices
        const v1 = [
            vertices[0][0] - centroid[0],
            vertices[0][1] - centroid[1],
            vertices[0][2] - centroid[2]
        ];
        
        // Find a second vector not collinear with v1
        let v2 = null;
        for (let i = 1; i < vertices.length; i++) {
            const candidate = [
                vertices[i][0] - centroid[0],
                vertices[i][1] - centroid[1],
                vertices[i][2] - centroid[2]
            ];
            
            // Check if not collinear using cross product
            const cross = [
                v1[1] * candidate[2] - v1[2] * candidate[1],
                v1[2] * candidate[0] - v1[0] * candidate[2],
                v1[0] * candidate[1] - v1[1] * candidate[0]
            ];
            
            const crossMag = Math.sqrt(cross[0]**2 + cross[1]**2 + cross[2]**2);
            if (crossMag > 1e-6) {
                v2 = candidate;
                break;
            }
        }
        
        if (!v2) {
            // All vertices are collinear, return as is
            return vertices;
        }
        
        // Calculate angles for each vertex
        const verticesWithAngles = vertices.map(vertex => {
            const v = [
                vertex[0] - centroid[0],
                vertex[1] - centroid[1],
                vertex[2] - centroid[2]
            ];
            
            // Project onto the plane defined by v1 and v2
            const dot1 = v[0]*v1[0] + v[1]*v1[1] + v[2]*v1[2];
            const dot2 = v[0]*v2[0] + v[1]*v2[1] + v[2]*v2[2];
            
            const angle = Math.atan2(dot2, dot1);
            return { vertex, angle };
        });
        
        // Sort by angle
        verticesWithAngles.sort((a, b) => a.angle - b.angle);
        
        return verticesWithAngles.map(item => item.vertex);
    }

    /**
     * Get the Delaunay tetrahedra
     */
    getDelaunayTetrahedra() {
        return this.tetrahedra;
    }
} 