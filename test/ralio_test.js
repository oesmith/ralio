var assert = require('assert'),
    nock = require('nock'),
    Ralio = require('../lib/ralio');

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
        'https://user1:password1@rally1.rallydev.com/slm/webservice/1.36/adhoc.js');
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
      nock('https://rally1.rallydev.com')
        .post('/slm/webservice/1.36/adhoc.js', expectedBody)
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
      nock('https://rally1.rallydev.com')
        .post('/slm/webservice/1.36/adhoc.js', expectedBody)
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
    it('should fetch the backlog stories for a given project');
  });

  describe('#sprint', function () {
    it('should fetch the sprint stories for a given project');
  });

  describe('#story', function () {
    it('should fetch the defect with the given ID');
    it('should fetch the user story with the given ID');
  });

  describe('#setTaskState', function () {
    it('should update the task with the given ID');
  });

  describe('#current', function () {
    it('should fetch all the stories that the current user is working on');
  });
});
