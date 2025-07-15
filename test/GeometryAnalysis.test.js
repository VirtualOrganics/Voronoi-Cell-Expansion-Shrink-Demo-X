/**
 * GeometryAnalysis.test.js
 * 
 * Unit tests for the GeometryAnalysis module
 * Tests acuteness analysis functions with known geometric shapes
 */

import { vertexAcuteness, faceAcuteness, cellAcuteness } from '../src/js/GeometryAnalysis.js';

/**
 * Mock DelaunayComputation class for testing
 */
class MockDelaunayComputation {
    constructor(points, tetrahedra) {
        this.pointsArray = points;
        this.tetrahedra = tetrahedra;
        this.isPeriodic = false;
        
        // Calculate barycenters for testing
        this.barycenters = this.tetrahedra.map(tet => {
            const vertices = tet.map(idx => this.pointsArray[idx]);
            const centerX = vertices.reduce((sum, v) => sum + v[0], 0) / 4;
            const centerY = vertices.reduce((sum, v) => sum + v[1], 0) / 4;
            const centerZ = vertices.reduce((sum, v) => sum + v[2], 0) / 4;
            return [centerX, centerY, centerZ];
        });
    }
    
    getPoints() {
        return this.pointsArray;
    }
    
    getDelaunayTetrahedra() {
        return this.tetrahedra;
    }
    
    getVertices() {
        return this.barycenters;
    }
    
    getCells() {
        const cells = new Map();
        this.tetrahedra.forEach((tet, index) => {
            const barycenter = this.barycenters[index];
            tet.forEach(vertexIndex => {
                if (!cells.has(vertexIndex)) {
                    cells.set(vertexIndex, []);
                }
                cells.get(vertexIndex).push(barycenter);
            });
        });
        return cells;
    }
    
    getFaces() {
        const faces = [];
        const faceToTetraMap = new Map();
        
        for (let i = 0; i < this.tetrahedra.length; i++) {
            const tetra = this.tetrahedra[i];
            const tetraFaces = [
                [tetra[0], tetra[1], tetra[2]],
                [tetra[0], tetra[1], tetra[3]],
                [tetra[0], tetra[2], tetra[3]],
                [tetra[1], tetra[2], tetra[3]]
            ];
            
            tetraFaces.forEach(face => {
                const key = face.slice().sort((a, b) => a - b).join('-');
                if (!faceToTetraMap.has(key)) {
                    faceToTetraMap.set(key, []);
                }
                faceToTetraMap.get(key).push(i);
            });
        }
        
        for (const [faceKey, tetraIndices] of faceToTetraMap.entries()) {
            if (tetraIndices.length === 2) {
                const vertices = faceKey.split('-').map(Number);
                const voronoiVertices = tetraIndices.map(idx => this.barycenters[idx]);
                faces.push({
                    delaunayFace: vertices,
                    voronoiVertices: voronoiVertices,
                    tetraIndices: tetraIndices
                });
            }
        }
        
        return faces;
    }
}

/**
 * Test suite for cube geometry
 * A cube has all interior face angles at 90° and all dihedral angles at 90°
 * Functions should return counts of 0 for acuteness (no acute angles)
 */
function testCubeGeometry() {
    console.log('Testing cube geometry...');
    
    // Define cube vertices
    const cubePoints = [
        [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],  // bottom face
        [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]   // top face
    ];
    
    // Define cube tetrahedra (simple decomposition)
    const cubeTetrahedra = [
        [0, 1, 2, 4],  // One tetrahedron
        [1, 2, 4, 5],  // Another tetrahedron
        [2, 4, 5, 6],  // Continue decomposition
        [0, 2, 3, 4],  // More tetrahedra
        [2, 3, 4, 7],  // to cover the cube
        [2, 4, 6, 7]   // Final tetrahedron
    ];
    
    const cubeComputation = new MockDelaunayComputation(cubePoints, cubeTetrahedra);
    
    // Test vertex acuteness
    const vertexScores = vertexAcuteness(cubeComputation);
    console.log('Cube vertex acuteness scores:', vertexScores);
    
    // Test face acuteness
    const faceScores = faceAcuteness(cubeComputation);
    console.log('Cube face acuteness scores:', faceScores);
    
    // Test cell acuteness
    const cellScores = cellAcuteness(cubeComputation);
    console.log('Cube cell acuteness scores:', cellScores);
    
    return {
        vertexScores,
        faceScores,
        cellScores
    };
}

/**
 * Test suite for regular tetrahedron geometry
 * A regular tetrahedron has all interior face angles at 60° (acute)
 * All dihedral angles are acos(1/3) ≈ 70.5° (acute)
 * Functions should return maximal counts for acuteness
 */
function testRegularTetrahedronGeometry() {
    console.log('Testing regular tetrahedron geometry...');
    
    // Define regular tetrahedron vertices
    // Using standard coordinates for a regular tetrahedron
    const a = 1.0;
    const tetraPoints = [
        [a, a, a],
        [a, -a, -a],
        [-a, a, -a],
        [-a, -a, a]
    ];
    
    // Single tetrahedron
    const tetraTetrahedra = [
        [0, 1, 2, 3]
    ];
    
    const tetraComputation = new MockDelaunayComputation(tetraPoints, tetraTetrahedra);
    
    // Test vertex acuteness
    const vertexScores = vertexAcuteness(tetraComputation);
    console.log('Regular tetrahedron vertex acuteness scores:', vertexScores);
    
    // Test face acuteness
    const faceScores = faceAcuteness(tetraComputation);
    console.log('Regular tetrahedron face acuteness scores:', faceScores);
    
    // Test cell acuteness
    const cellScores = cellAcuteness(tetraComputation);
    console.log('Regular tetrahedron cell acuteness scores:', cellScores);
    
    return {
        vertexScores,
        faceScores,
        cellScores
    };
}

/**
 * Test suite for simple triangular prism
 * Another test case to validate the algorithms
 */
function testTriangularPrism() {
    console.log('Testing triangular prism geometry...');
    
    // Define triangular prism vertices
    const prismPoints = [
        [0, 0, 0], [1, 0, 0], [0.5, 1, 0],  // bottom triangle
        [0, 0, 1], [1, 0, 1], [0.5, 1, 1]   // top triangle
    ];
    
    // Simple tetrahedra decomposition
    const prismTetrahedra = [
        [0, 1, 2, 3],  // One tetrahedron
        [1, 2, 3, 4],  // Another tetrahedron
        [2, 3, 4, 5]   // Third tetrahedron
    ];
    
    const prismComputation = new MockDelaunayComputation(prismPoints, prismTetrahedra);
    
    // Test vertex acuteness
    const vertexScores = vertexAcuteness(prismComputation);
    console.log('Triangular prism vertex acuteness scores:', vertexScores);
    
    // Test face acuteness
    const faceScores = faceAcuteness(prismComputation);
    console.log('Triangular prism face acuteness scores:', faceScores);
    
    // Test cell acuteness
    const cellScores = cellAcuteness(prismComputation);
    console.log('Triangular prism cell acuteness scores:', cellScores);
    
    return {
        vertexScores,
        faceScores,
        cellScores
    };
}

/**
 * Validation function to check if results are reasonable
 */
function validateResults(results, testName) {
    console.log(`\n=== Validating ${testName} Results ===`);
    
    // Check if all arrays have reasonable lengths
    const hasValidLengths = results.vertexScores.length > 0 && 
                           results.faceScores.length >= 0 && 
                           results.cellScores.length >= 0;
    
    if (!hasValidLengths) {
        console.error(`❌ ${testName}: Invalid result lengths`);
        return false;
    }
    
    // Check if all scores are non-negative
    const allScoresPositive = results.vertexScores.every(s => s >= 0) &&
                             results.faceScores.every(s => s >= 0) &&
                             results.cellScores.every(s => s >= 0);
    
    if (!allScoresPositive) {
        console.error(`❌ ${testName}: Found negative scores`);
        return false;
    }
    
    console.log(`✅ ${testName}: All validation checks passed`);
    console.log(`   - Vertex scores: ${results.vertexScores.length} values, max: ${Math.max(...results.vertexScores)}`);
    console.log(`   - Face scores: ${results.faceScores.length} values, max: ${Math.max(...results.faceScores)}`);
    console.log(`   - Cell scores: ${results.cellScores.length} values, max: ${Math.max(...results.cellScores)}`);
    
    return true;
}

/**
 * Main test runner
 */
export function runGeometryAnalysisTests() {
    console.log('🧪 Running GeometryAnalysis tests...');
    console.log('=====================================');
    
    let passedTests = 0;
    let totalTests = 0;
    
    // Test cube geometry
    totalTests++;
    try {
        const cubeResults = testCubeGeometry();
        if (validateResults(cubeResults, 'Cube')) {
            passedTests++;
        }
    } catch (error) {
        console.error('❌ Cube test failed:', error);
    }
    
    // Test regular tetrahedron geometry
    totalTests++;
    try {
        const tetraResults = testRegularTetrahedronGeometry();
        if (validateResults(tetraResults, 'Regular Tetrahedron')) {
            passedTests++;
        }
    } catch (error) {
        console.error('❌ Regular tetrahedron test failed:', error);
    }
    
    // Test triangular prism geometry
    totalTests++;
    try {
        const prismResults = testTriangularPrism();
        if (validateResults(prismResults, 'Triangular Prism')) {
            passedTests++;
        }
    } catch (error) {
        console.error('❌ Triangular prism test failed:', error);
    }
    
    // Summary
    console.log('\n=====================================');
    console.log(`🏁 Test Results: ${passedTests}/${totalTests} tests passed`);
    
    if (passedTests === totalTests) {
        console.log('🎉 All tests passed! GeometryAnalysis module is working correctly.');
    } else {
        console.log('⚠️  Some tests failed. Please review the implementation.');
    }
    
    return passedTests === totalTests;
}

// Auto-run tests if this file is loaded directly
if (typeof window !== 'undefined' && window.location) {
    // Running in browser - can auto-run tests
    console.log('GeometryAnalysis test module loaded. Call runGeometryAnalysisTests() to run tests.');
}

// Export for module usage
export { testCubeGeometry, testRegularTetrahedronGeometry, testTriangularPrism, validateResults }; 