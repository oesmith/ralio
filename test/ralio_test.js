var assert = require('assert'),
    nock = require('nock'),
    sinon = require('sinon'),
    Ralio = require('../lib/ralio');

require('sinon-mocha').enhance(sinon);

var RALLY_HOST = "rally1.rallydev.com",
    RALLY_SERVER = "https://" + RALLY_HOST,
    RALLY_BULK_PATH = "/slm/webservice/1.36/adhoc.js";

describe('Ralio', function () {

  before(function () {
    Ralio.test = true;
  });

  beforeEach(function () {
    this.ralio = new Ralio('user1', 'password1');
  });

  afterEach(function () {
    nock.cleanAll();
  });

  describe('#bulkUrl', function () {
    it('should insert auth credentials', function () {
      assert.equal(
        this.ralio.bulkUrl(),
        'https://user1:password1@' + RALLY_HOST + RALLY_BULK_PATH);
    });
  });

  describe('#bulk', function () {
    it('should send bulk queries', function (done) {
      var request = {
        foo: {},
        bar: '/bar',
        baz: {bap: '1,2,3', bop: 'bop'}
      };
      var expectedBody = {
        foo: '/foo?',
        bar: '/bar',
        baz: '/baz?bap=1%2C2%2C3&bop=bop'
      };
      nock(RALLY_SERVER)
        .post(RALLY_BULK_PATH, expectedBody)
        .reply(200, {foo: {bar: 'baz'}});
      this.ralio.bulk(request, function (error, data) {
        assert.equal(error, null);
        assert.deepEqual(data, {foo: {bar: 'baz'}});
        done();
      });
    });

    it('should catch HTTP errors', function (done) {
      var request = {foo: {}};
      var expectedBody = {foo: '/foo?'};
      nock(RALLY_SERVER)
        .post(RALLY_BULK_PATH, expectedBody)
        .reply(500, 'OMG BAD THINGS');
      this.ralio.bulk(request, function (error, data) {
        assert.equal(error, 'OMG BAD THINGS');
        done();
      });
    });
  });

  describe('#update', function () {
    it('should send updates', function (done) {
      nock('https://example.com')
        .post('/ref', {name: 'foo', desc: 'bar'})
        .reply(200, {OperationResult: {Errors: []}});
      this.ralio.update(
        'https://example.com/ref',
        {name: 'foo', desc: 'bar'},
        function (error) {
          assert.equal(error, null);
          done();
        }
      );
    });

    it('should catch HTTP errors', function (done) {
      nock('https://example.com')
        .post('/ref', {name: 'foo', desc: 'bar'})
        .reply(400, "IT WENT WRONG");
      this.ralio.update(
        'https://example.com/ref',
        {name: 'foo', desc: 'bar'},
        function (error) {
          assert.equal(error, "IT WENT WRONG");
          done();
        }
      );
    });

    it('should catch Rally operation errors', function (done) {
      nock('https://example.com')
        .post('/ref', {name: 'foo', desc: 'bar'})
        .reply(200, {OperationResult: {Errors: ['Bad romance']}});
      this.ralio.update(
        'https://example.com/ref',
        {name: 'foo', desc: 'bar'},
        function (error) {
          assert.deepEqual(error, ["Bad romance"]);
          done();
        }
      );
    });
  });

  describe('#backlog', function () {
    it('should fetch the backlog stories for a given project', function (done) {
      var query = {
        fetch: 'Name,FormattedID,Rank,PlanEstimate',
        order: 'Rank',
        query: '((Project.Name = "project1") AND (Iteration = NULL))',
        pagesize: 16
      };
      var query_result = {
        hierarchicalrequirement: {
          Results: [
            { FormattedID: 'US0000', Rank: 50 },
            { FormattedID: 'US0001', Rank: 52 },
            { FormattedID: 'US0002', Rank: 48 },
            { FormattedID: 'US0003', Rank: 54 },
            { FormattedID: 'US0004', Rank: 46 },
            { FormattedID: 'US0005', Rank: 56 }
          ]
        },
        defect: {
          Results: [
            { FormattedID: 'DE0000', Rank: 51 },
            { FormattedID: 'DE0001', Rank: 53 },
            { FormattedID: 'DE0002', Rank: 49 },
            { FormattedID: 'DE0003', Rank: 55 },
            { FormattedID: 'DE0004', Rank: 47 },
            { FormattedID: 'DE0005', Rank: 57 }
          ]
        }
      }
      var ex = sinon.mock(this.ralio).expects('bulk').once()
        .withArgs({ hierarchicalrequirement: query, defect: query });

      this.ralio.backlog('project1', 16, function (error, stories) {
        assert.equal(error, null);
        assert.deepEqual(stories, [
          { FormattedID: 'US0004', Rank: 46 },
          { FormattedID: 'DE0004', Rank: 47 },
          { FormattedID: 'US0002', Rank: 48 },
          { FormattedID: 'DE0002', Rank: 49 },
          { FormattedID: 'US0000', Rank: 50 },
          { FormattedID: 'DE0000', Rank: 51 },
          { FormattedID: 'US0001', Rank: 52 },
          { FormattedID: 'DE0001', Rank: 53 },
          { FormattedID: 'US0003', Rank: 54 },
          { FormattedID: 'DE0003', Rank: 55 },
          { FormattedID: 'US0005', Rank: 56 },
          { FormattedID: 'DE0005', Rank: 57 }
        ])
        done();
      });

      ex.yield(null, query_result);
    });
  });

  describe('#sprint', function () {
    it('should fetch the sprint stories for a given project', function (done) {
      var query = {
        fetch: 'Name,FormattedID,Rank,PlanEstimate,ScheduleState,Tasks,State,Owner,TaskIndex,Blocked',
        order: 'Rank',
        query: '((Project.Name = "project2") AND ((Iteration.StartDate <= "1970-01-01") AND (Iteration.EndDate >= "1970-01-01")))',
        pagesize: 100
      };
      var result = {
        hierarchicalrequirement: {
          Results: [
            { FormattedID: 'US0000', Rank: 50, Tasks: [
                { FormattedID: 'TA0000', TaskIndex: 3 },
                { FormattedID: 'TA0001', TaskIndex: 1 },
                { FormattedID: 'TA0002', TaskIndex: 2 },
              ] },
            { FormattedID: 'US0001', Rank: 52, Tasks: [] },
          ]
        },
        defect: {
          Results: [
            { FormattedID: 'DE0000', Rank: 51, Tasks: [
                { FormattedID: 'TA0003', TaskIndex: 1 },
                { FormattedID: 'TA0004', TaskIndex: 11 },
              ] },
            { FormattedID: 'DE0001', Rank: 53, Tasks: [
                { FormattedID: 'TA0005', TaskIndex: 0 }
              ] },
          ]
        }
      }
      var mock = sinon.mock(this.ralio);
      mock.expects('date').once().returns('1970-01-01');
      var ex = mock.expects('bulk').once()
        .withArgs({hierarchicalrequirement: query, defect: query});

      this.ralio.sprint('project2', function (error, stories) {
        assert.equal(error, null);
        assert.deepEqual(stories, [
          { FormattedID: 'US0000', Rank: 50, Tasks: [
              { FormattedID: 'TA0001', TaskIndex: 1 },
              { FormattedID: 'TA0002', TaskIndex: 2 },
              { FormattedID: 'TA0000', TaskIndex: 3 }
            ] },
          { FormattedID: 'DE0000', Rank: 51, Tasks: [
              { FormattedID: 'TA0003', TaskIndex: 1 },
              { FormattedID: 'TA0004', TaskIndex: 11 }
            ] },
          { FormattedID: 'US0001', Rank: 52, Tasks: [] },
          { FormattedID: 'DE0001', Rank: 53, Tasks: [
              { FormattedID: 'TA0005', TaskIndex: 0 }
            ] },
        ])
        done();
      });

      ex.yield(null, result);
    });
  });

  describe('#story', function () {
    it('should fetch the defect with the given ID', function (done) {
      var ex = sinon.mock(this.ralio).expects('bulk').once()
        .withArgs({ defect: {
          fetch: 'Name,FormattedID,PlanEstimate,ScheduleState,Tasks,State,Owner,TaskIndex,Blocked,Project,ObjectID,Description',
          query: '(FormattedID = "DE4321")'
        }});

      this.ralio.story('DE4321', function (error, story) {
        assert.equal(error, null);
        assert.deepEqual(story, {
          FormattedID: 'DE4321', Name: 'Test Story', Tasks: [
            { FormattedID: 'TA0001', TaskIndex: 1 },
            { FormattedID: 'TA0002', TaskIndex: 2 },
            { FormattedID: 'TA0000', TaskIndex: 3 }
          ]
        });
        done();
      });

      ex.yield(null, {
        defect: {
          Results: [
            { FormattedID: 'DE4321', Name: 'Test Story', Tasks: [
                { FormattedID: 'TA0001', TaskIndex: 1 },
                { FormattedID: 'TA0002', TaskIndex: 2 },
                { FormattedID: 'TA0000', TaskIndex: 3 }
              ] }
          ]
        }
      });
    });

    it('should fetch the user story with the given ID', function (done) {
      var ex = sinon.mock(this.ralio).expects('bulk').once()
        .withArgs({ hierarchicalrequirement: {
          fetch: 'Name,FormattedID,PlanEstimate,ScheduleState,Tasks,State,Owner,TaskIndex,Blocked,Project,ObjectID,Description',
          query: '(FormattedID = "US4321")'
        }});

      this.ralio.story('US4321', function (error, story) {
        assert.equal(error, null);
        assert.deepEqual(story, {
          FormattedID: 'US4321', Name: 'Test Story', Tasks: [
            { FormattedID: 'TA0001', TaskIndex: 1 },
            { FormattedID: 'TA0002', TaskIndex: 2 },
            { FormattedID: 'TA0000', TaskIndex: 3 }
          ]
        });
        done();
      });

      ex.yield(null, {
        hierarchicalrequirement: {
          Results: [
            { FormattedID: 'US4321', Name: 'Test Story', Tasks: [
                { FormattedID: 'TA0001', TaskIndex: 1 },
                { FormattedID: 'TA0002', TaskIndex: 2 },
                { FormattedID: 'TA0000', TaskIndex: 3 }
              ] }
          ]
        }
      });
    });
  });

  describe('#setTaskState', function () {
    it('should update the task with the given ID');
  });

  describe('#current', function () {
    it('should fetch all the stories that the current user is working on');
  });
});
