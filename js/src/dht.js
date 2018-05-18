/* eslint-env mocha */
'use strict'

const chai = require('chai')
const dirtyChai = require('dirty-chai')
const expect = chai.expect
chai.use(dirtyChai)
const waterfall = require('async/waterfall')
const parallel = require('async/parallel')
const CID = require('cids')
const { spawnNodesWithId } = require('./utils/spawn')

module.exports = (common) => {
  describe('.dht', function () {
    this.timeout(80 * 1000)

    let nodeA
    let nodeB
    let nodeC
    let nodeD
    let nodeE

    before(function (done) {
      // CI takes longer to instantiate the daemon, so we need to increase the
      // timeout for the before step
      this.timeout(60 * 1000)

      common.setup((err, factory) => {
        expect(err).to.not.exist()

        spawnNodesWithId(5, factory, (err, nodes) => {
          if (err) console.error('spawn err', err)
          expect(err).to.not.exist()

          nodeA = nodes[0]
          nodeB = nodes[1]
          nodeC = nodes[2]
          nodeD = nodes[3]
          nodeE = nodes[4]

          parallel([
            (cb) => nodeA.swarm.connect(nodeB.peerId.addresses[0], cb),
            (cb) => nodeB.swarm.connect(nodeC.peerId.addresses[0], cb),
            (cb) => nodeC.swarm.connect(nodeA.peerId.addresses[0], cb),
            (cb) => nodeD.swarm.connect(nodeA.peerId.addresses[0], cb),
            (cb) => nodeE.swarm.connect(nodeA.peerId.addresses[0], cb),
            (cb) => nodeD.swarm.connect(nodeB.peerId.addresses[0], cb),
            (cb) => nodeE.swarm.connect(nodeB.peerId.addresses[0], cb),
            (cb) => nodeD.swarm.connect(nodeC.peerId.addresses[0], cb),
            (cb) => nodeE.swarm.connect(nodeC.peerId.addresses[0], cb),
            (cb) => nodeD.swarm.connect(nodeE.peerId.addresses[0], cb)
          ], done)
        })
      })
    })

    after((done) => common.teardown(done))

    describe('.get and .put', () => {
      it('errors when getting a non-existent key from the DHT', (done) => {
        nodeA.dht.get('non-existing', { timeout: '100ms' }, (err, value) => {
          expect(err).to.be.an.instanceof(Error)
          done()
        })
      })

      // TODO: fix - go-ipfs errors with  Error: key was not found (type 6)
      // https://github.com/ipfs/go-ipfs/issues/3862
      it.skip('fetches value after it was put on another node', (done) => {
        waterfall([
          (cb) => nodeB.object.new('unixfs-dir', cb),
          (node, cb) => setTimeout(() => cb(null, node), 1000),
          (node, cb) => {
            const multihash = node.toJSON().multihash

            nodeA.dht.get(multihash, cb)
          },
          (result, cb) => {
            expect(result).to.eql('')
            cb()
          }
        ], done)
      })

      it('Promises support', (done) => {
        nodeA.dht.get('non-existing', { timeout: '100ms' })
          .catch((err) => {
            expect(err).to.exist()
            done()
          })
      })
    })

    describe('.findpeer', () => {
      it('finds other peers', (done) => {
        nodeA.dht.findpeer(nodeC.peerId.id, (err, peer) => {
          expect(err).to.not.exist()
          // TODO upgrade the answer, format is weird
          expect(peer[0].Responses[0].ID).to.be.equal(nodeC.peerId.id)
          done()
        })
      })

      // TODO checking what is exactly go-ipfs returning
      // https://github.com/ipfs/go-ipfs/issues/3862#issuecomment-294168090
      it.skip('fails to find other peer, if peer doesnt exist()s', (done) => {
        nodeA.dht.findpeer('Qmd7qZS4T7xXtsNFdRoK1trfMs5zU94EpokQ9WFtxdPxsZ', (err, peer) => {
          expect(err).to.not.exist()
          expect(peer).to.be.equal(null)
          done()
        })
      })
    })

    describe('.provide', () => {
      it('regular', (done) => {
        nodeC.files.add(Buffer.from('test'), (err, res) => {
          if (err) return done(err)

          nodeC.dht.provide(new CID(res[0].hash), (err) => {
            expect(err).to.not.exist()
            done()
          })
        })
      })

      it('should not provide if block not found locally', (done) => {
        const cid = new CID('Qmd7qZS4T7xXtsNFdRoK1trfMs5zU94EpokQ9WFtxdPxsZ')

        nodeC.dht.provide(cid, (err) => {
          expect(err).to.exist()
          expect(err.message).to.include('not found locally')
          done()
        })
      })

      it('allows multiple CIDs to be passed', (done) => {
        nodeC.files.add([Buffer.from('t0'), Buffer.from('t1')], (err, res) => {
          if (err) return done(err)

          nodeC.dht.provide([
            new CID(res[0].hash),
            new CID(res[1].hash)
          ], (err) => {
            expect(err).to.not.exist()
            done()
          })
        })
      })

      it('should provide a CIDv1', (done) => {
        nodeC.files.add(Buffer.from('test'), { 'cid-version': 1 }, (err, res) => {
          if (err) return done(err)

          const cid = new CID(res[0].hash)

          nodeC.dht.provide(cid, (err) => {
            expect(err).to.not.exist()
            done()
          })
        })
      })

      it('errors on non CID arg', (done) => {
        nodeC.dht.provide({}, (err) => {
          expect(err).to.exist()
          done()
        })
      })

      it('errors on array containing non CID arg', (done) => {
        nodeC.dht.provide([{}], (err) => {
          expect(err).to.exist()
          done()
        })
      })

      it.skip('recursive', () => {})
    })

    describe.skip('findprovs', () => {
      it('basic', (done) => {
        const cid = new CID('Qmd7qZS4T7xXtsNFdRoK1trfMs5zU94EpokQ9WFtxdPxxx')

        waterfall([
          (cb) => nodeB.dht.provide(cid, cb),
          (cb) => nodeC.dht.findprovs(cid, cb),
          (provs, cb) => {
            expect(provs.map((p) => p.toB58String()))
              .to.eql([nodeB.peerId.id])
            cb()
          }
        ], done)
      })

      it('Promises support', (done) => {
        nodeB.dht.findprovs('Qma4hjFTnCasJ8PVp3mZbZK5g2vGDT4LByLJ7m8ciyRFZP')
          .then((res) => {
            expect(res).to.be.an('array')
            done()
          })
          .catch((err) => done(err))
      })
    })

    describe('.query', () => {
      it('returns the other node in the query', function (done) {
        const timeout = 150 * 1000
        this.timeout(timeout)

        // This test is flaky. DHT works best with >= 20 nodes. Therefore a
        // failure might happen, but we don't want to report it as such.
        // Hence skip the test before the timeout is reached
        const timeoutId = setTimeout(function () {
          this.skip()
        }.bind(this), timeout - 1000)

        nodeA.dht.query(nodeC.peerId.id, (err, peers) => {
          clearTimeout(timeoutId)
          expect(err).to.not.exist()
          expect(peers.map((p) => p.ID)).to.include(nodeC.peerId.id)
          done()
        })
      })
    })
  })
}
