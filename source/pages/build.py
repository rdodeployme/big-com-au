import re
head=open('_head.html').read(); hdr=open('_header.html').read(); ftr=open('_footer.html').read()
pages={'standard.html':('_standard_body.html','The BIG Standard — recycle to standard','A model subcontract clause, stage checks and trade sheet for recycling on new home sites.','standard.html'),
       'your-home.html':('_yourhome_body.html','Your Home and BIG','How the BIG system delivers the Australian Government Your Home waste minimisation guidance on site.','your-home.html'),
       'method.html':('_method_body.html','How BIG bays are sized','The data, conversion and assumptions behind the size of each BIG bay.','method.html')}
for out,(body,title,desc,href) in pages.items():
    h=re.sub(r'<title>.*?</title>',f'<title>{title}</title>',head)
    h=re.sub(r'(<meta name="description" content=")[^"]*',r'\g<1>'+desc,h)
    hd=hdr.replace(f'href="{href}"',f'href="{href}" aria-current="page"')
    open(out,'w').write(h+'<a class="skip" href="#main">Skip to content</a>\n'+hd+'\n'+open(body).read()+'\n'+ftr+'\n</body>\n</html>\n')
    print('wrote',out)
