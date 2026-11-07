require 'jekyll'
site = Jekyll::Site.new(Jekyll.configuration({'source' => Dir.pwd, 'destination' => '_site'}))
source = File.read('_includes/post-cover.html') + '{{ resolved_cover }}'
cases = [
  [{'cover' => '/assets/custom.jpg', 'content' => '<img src="/assets/body.jpg">'}, '/my-diary/assets/custom.jpg'],
  [{'content' => '<p><img src="/my-diary/assets/first.jpg"><img src="/assets/second.jpg"></p>'}, '/my-diary/assets/first.jpg'],
  [{'cover_auto' => false, 'content' => '<img src="/assets/body.jpg">'}, ''],
  [{'content' => '사진 없는 글'}, ''],
  [{'content' => '<img src="https://example.com/image.jpg">'}, 'https://example.com/image.jpg'],
  [{'content' => "<img src='/assets/single.jpg'>"}, '/my-diary/assets/single.jpg']
]
cases.each do |post, expected|
  actual = Liquid::Template.parse(source).render!({'include' => {'post' => post}, 'site' => site.config}, {registers: {site: site}}).strip
  raise "Expected #{expected.inspect}, got #{actual.inspect}" unless actual == expected
end
puts "6 cover-template cases passed"
