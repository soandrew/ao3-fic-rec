/* Polyfills */
Array.prototype.flatten = function() {
  return this.reduce((acc, val) => acc.concat(val), []);
}
Set.prototype.union = function(setB) {
  var union = new Set(this);
  for (let elem of setB) {
    union.add(elem);
  }
  return union;
}
Set.prototype.intersection = function(setB) {
  var intersection = new Set();
  for (let elem of setB) {
    if (this.has(elem)) intersection.add(elem);
  }
  return intersection;
}
Set.prototype.difference = function(setB) {
  var difference = new Set(this);
  for (let elem of setB) {
    difference.delete(elem);
  }
  return difference;
}

/* Constants */
const BASE_URL = 'https://archiveofourown.org';
const BASE_WORK_URL = BASE_URL + '/works/';
const BASE_TAG_URL = BASE_URL + '/tags/';
const BASE_USER_URL = BASE_URL + '/users/';

/**
 * An HTML anchor tag.
 */
class Link {
  /**
   * $a: jQuery
   * ----------
   * text: string
   * url: string
   * ----------
   * text: string
   * url: string
   * rel: string
   */
  constructor(...args) {
    var text, url, rel;
    if (args.length === 1) {
      let [$a] = args;
      text = $a.text().trim();
      url = BASE_URL + $a.attr('href');
      rel = $a.attr('rel');
    } else {
      [text, url, rel] = args;
    }
    this.text = text;
    this.url = url;
    if (rel) this.rel = rel;
  }
  
  /**
   * Return HTML code for this Link.
   */
  link() {
    return `<a ${this.rel ? 'rel="${this.rel}"' : ''} href="${this.url}">${this.text}</a>`;
  }
}

/**
 * An AO3 work.
 */
class Work {
  /**
   * id: string
   * title: Link
   * author: array[Link]
   * summary: string
   * tags: object{string: array[Link]}
   *   Properties: 'fandoms', 'rating', 'warnings', 'categories', 'relationships', 'characters', 'additional tags'
   * stats: object{string: integer}
   *  Properties: 'words', 'comments', 'kudos', 'bookmarks', 'hits'
   */
  constructor(id, title, author, summary, tags, stats) {
    this.id = id;
    this.title = title;
    this.author = author;
    this.summary = summary;
    this.tags = tags;
    this.stats = stats;
  }

  /**
   * Return number of tags this Work has in common with other Work.
   * 
   * other: Work
   */
  similarity(other) {
    // Build set of tags for this Work and other Work
    var thisTagSet = new Set(Object.values(this.tags).flatten().map(tag => tag.text));
    var otherTagSet = new Set(Object.values(other.tags).flatten().map(tag => tag.text));

    return thisTagSet.intersection(otherTagSet).size;
  }

  /**
   * Return users who bookmarked this Work as an array of Links.
   *
   * limit: integer|null (default 1)
   */
  async bookmarkers({limit=1}={}) {
    var url = BASE_WORK_URL + this.id + '/bookmarks';
    // Get webpage
    var $context = await $.getJSON(cors(url)).then(body => {
      console.log('GET', url);
      return $($.parseHTML(body.contents));
    }).catch(err => console.log(err.status, url));
    if (!$) return [];
    // Retrieved webpage without any errors
    return $context.find('.user .byline a').map((i, a) => new Link($(a))).toArray();
  }
}

/**
 * Return a Work constructed by scraping data within context.
 * 
 * $context: jQuery
 */
function work($context) {
  var headingLinks = getLinks($context, '.header .heading:not(.fandoms)');
  var title = headingLinks[0];
  var author = headingLinks.filter(link => link.rel === 'author');
  var summary = ($context.find('.summary').html() || '').trim();
  var tags = {
    'fandoms': getLinks($context, '.header .fandoms'),
    'rating': getText($context, '.required-tags .rating')
                .split(', ')
                .map(rating => new Link(rating, BASE_TAG_URL + slugify(rating) + '/works')),
    'warnings': getLinks($context, '.tags .warnings'),
    'categories': getText($context, '.required-tags .category:not(.category-none)')
                    .split(', ')
                    .map(category => new Link(category, BASE_TAG_URL + slugify(category) + '/works')),
    'relationships': getLinks($context, '.tags .relationships'),
    'characters': getLinks($context, '.tags .characters'),
    'additional tags': getLinks($context, '.tags .freeforms')
  };
  var stats = {
    'words': getNumber($context, 'dd.words'),
    'comments': getNumber($context,'dd.comments'),
    'kudos': getNumber($context,'dd.kudos'),
    'bookmarks': getNumber($context,'dd.bookmarks'),
    'hits': getNumber($context,'dd.hits')
  };
  return new Work(title.url.split('/').pop(), title, author, summary, tags, stats);
}

/**
 * Return an array of Works constructed by scraping data from url.
 * 
 * url: string
 * limit: integer|null (default 1)
 */
async function works(url, {limit=1}={}) {
  // Get webpage
  var $context = await $.getJSON(cors(url)).then(body => {
    console.log('GET', url);
    return $($.parseHTML(body.contents));
  }).catch(err => console.log(err.status, url));
  if (!$context) return [];
  // Retrieved webpage without any errors
  return Promise.all($context.find('.index .blurb').map((i, elem) => {
    $elem = $(elem);
    if ($elem.find(".message:contains('deleted')").length > 0) {  // Deleted
      return []
    } else if ($elem.find("dt:contains('Works')").length > 0) {  // Series
      return works(BASE_URL + $elem.find('.heading a').first().attr('href'));
    } else {  // Work
      return work($elem);
    }
  }).toArray()).then(works => works.flatten());
}

/**
 * Return a cross origin version of url.
 */
function cors(url) {
  return 'https://allorigins.me/get?url=' + encodeURIComponent(url) + '&callback=?'
}

/**
 * Return an url appropriate version of s.
 *
 * s: string
 */
function slugify(s) {
  s = s.replace(' ', '%20');
  s = s.replace('/', '*s*');
  return s
}

/**
 * Select elements within context, and return collective text as a trimmed string.
 *
 * $context: jQuery
 * selector: string
 */
function getText($context, selector) {
  return $context.find(selector || '*').text().trim();
}

/**
 * Select elements within context, and parse collective text as a number.
 *
 * $context: jQuery
 * selector: string
 */
function getNumber($context, selector) {
  return Number(getText($context, selector).replace(',', ''));
}

/**
 * Select links within elements within context, and return as an array of Links.
 *
 * $context: jQuery
 * selector: string
 */
function getLinks($context, selector) {
  return $context.find((selector || '*') + ' a')
                 .map((i, a) => new Link($(a)))
                 .toArray();
}

/**
 * Return list of Works bookmarked by user.
 *
 * user: Link
 * limit: integer|null (default 1)
 */
async function getBookmarks(user, {limit=1}={}) {
  var bookmarks = await works(user.url + '/bookmarks');
  bookmarks.forEach(bookmark => bookmark._bookmarkers = [user]);
  return bookmarks;
}

/**
 * Return list of recommended Works using bookmarks of username sorted by relevance.
 *
 * username: string
 */
function getRecommendations(username) {
  var you = new Link(username, BASE_USER_URL + username);
  return getBookmarks(you).then(bookmarks => {
    bookmarks = bookmarks.filter(bookmark => bookmark.stats['bookmarks'] > 0);
    var bookmarksIds = new Set(bookmarks.map(bookmark => bookmark.id));
    var bookmark = bookmarks[Math.floor(Math.random() * bookmarks.length)];
    return bookmark.bookmarkers().then(users => {
      users = users.filter(user => user.text !== you.text);
      return Promise.all(users.map(user => getBookmarks(user))).then(works => {
        works = works.flatten()
        var seen = {};
        for (let i = works.length - 1; i >= 0; i--) {
          let work = works[i];
          if (bookmarksIds.has(work.id)) {  // Already bookmarked
            works.splice(i, 1);
          } else if (work.id in seen) {  // Duplicate
            seen[work.id]._bookmarkers.push(...work._bookmarkers);
            works.splice(i, 1);
          } else {  // Compute average similarity
            seen[work.id] = work;
            work._similarity = bookmarks.map(bookmark => work.similarity(bookmark)).reduce((a, b) => a + b, 0) / bookmarks.length;
          }
        }
        works.sort((a, b) => b._similarity * b._bookmarkers.length - a._similarity * a._bookmarkers.length);
        return [bookmark, works];
      })
    })
  })
}

// getRecommendations('irocandrew').then(([bookmark, works]) => {
// console.log(`Bookmark: ${bookmark.title.text}`);
//   works.slice(0, 5).forEach(work => {
//     console.log(`Recommendation: ${work.title.text} (${work._bookmarkers.length}, ${work._similarity.toFixed(2)})`);
//   });
// })

$(document).ready(function() {
  $('#recommend').click(e => {
    e.preventDefault();
    var username = $('#username').val();
    if (!username) return;

    $('#results').empty();
    $('#empty').addClass('hidden');
    $('#loading').removeClass('hidden');
    getRecommendations(username).then(([bookmark, works]) => {
      // Check for no results
      if (!works.length) {
        $('#empty').removeClass('hidden');
        $('#loading').addClass('hidden');
        return;
      }
      // Build result list
      works.slice(0, 20).forEach(work => {  // Limit to first 20
        // Build result
        var $result = $('<li>')
          .addClass('result row')
          .append($('<h2>').html(work.title.link()))
          .append($('<p>').html('by ' + (work.author.map(author => author.link()).join(', ') || 'Anonymous')))
          .append($('<hr>'))
          .append(work.summary)
          .append($('<hr>'));
        Object.keys(work.tags).forEach(key => {
          $result.append(
            $('<div>')
              .addClass('tag-item')
              .append($('<div>').addClass('tag-key').text(key + ':'))
              .append($('<div>').addClass('tag-value').html(work.tags[key].map(tag => tag.link()).join(' ')))
          );
        });
        $result
          .append(
            $('<div>')
              .addClass('tag-item')
              .append($('<div>').addClass('tag-key').text('words:'))
              .append($('<div>').addClass('tag-value').text(work.stats['words'].toLocaleString()))
          ).append($('<hr>'))
          .append(
            $('<small>')
              .addClass('text-muted')
              .text(`Recommended because ${work._bookmarkers.length} ${work._bookmarkers.length == 1 ? 'user' : 'users'} who bookmarked one of your bookmarks`
                    + ` also bookmarked this fic which has on average ${work._similarity.toFixed(2)} tags similar to the rest of your bookmarks.`)
            );
        // Add even listeners
        $result.click(e => {
            if (e.ctrlKey || e.metaKey || e.which === 2) {  // Ctrl/Cmd/Middle click
              window.open($result.find('a').first().attr('href'));
            } else {
              window.location = $result.find('a').first().attr('href');
            }
        });
        $result.find('a').click(e => {
          e.stopPropagation();
        })
        // Append to result list
        $('#results').append($result);
      });// /works.forEach
      $('#loading').addClass('hidden');
    });// /getRecommendations.then
  });// /click
});
